/**
 * Refund for a failed paid API call.
 *
 * IMPORTANT: x402 payments are plain on-chain USDC transfers — there is no
 * reversible card-style chargeback. A "refund" here is a fresh USDC transfer
 * from the resource (payee) wallet back to the original payer for the amount they
 * paid. This requires the payee wallet's private key (RESOURCE_WALLET_PRIVATE_KEY).
 *
 * The send goes through the Coinbase CDP SDK rather than raw viem: we import the
 * resource wallet's private key as a CDP server account once, then issue
 * transfers. CDP manages the account nonce server-side, which avoids the
 * "nonce too low / already known" races we hit when broadcasting several
 * refunds back-to-back through a local viem wallet client.
 */
import { getAddress, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CdpClient } from "@coinbase/cdp-sdk";
import { trace, SpanStatusCode } from "@opentelemetry/api";
import type { Span } from "../http-status-counts";

// Emits an `x402.refund` span to Arize for every refund action (dry-run preview
// and real send), correlatable to the originating `x402.payment` span via the
// payment tx hash. Like the payment span it must be tagged with
// `openinference.span.kind` or instrumentation.ts's isOpenInferenceSpan filter
// drops it.
const tracer = trace.getTracer("refund-worker");

// Networks CDP accepts for an EVM transfer that we care about here.
type RefundNetwork = "base-sepolia" | "base";

function refundNetwork(): RefundNetwork {
  const n = process.env.X402_NETWORK?.trim();
  return n === "base" ? "base" : "base-sepolia";
}

export interface RefundResult {
  ok: boolean;
  spanId: string;
  paymentTxHash?: string;
  refundTxHash?: Hex;
  amountAtomic?: string;
  payer?: string;
  reason?: string; // populated when ok === false
}

/** True only when every credential needed for a real CDP send is present. */
function missingSendCreds(): string[] {
  const missing: string[] = [];
  if (!process.env.RESOURCE_WALLET_PRIVATE_KEY) missing.push("RESOURCE_WALLET_PRIVATE_KEY");
  if (!process.env.CDP_API_KEY_ID) missing.push("CDP_API_KEY_ID");
  if (!process.env.CDP_API_KEY_SECRET) missing.push("CDP_API_KEY_SECRET");
  if (!process.env.CDP_WALLET_SECRET) missing.push("CDP_WALLET_SECRET");
  return missing;
}

// ---- Lazily-imported CDP server account (singleton across the process) -------
// importAccount uploads the key to CDP the first time; subsequent process starts
// (or a second import of the same key) raise an "already exists" style error, so
// we fall back to getAccount by address. We memoize the resolved account.
type CdpServerAccount = Awaited<ReturnType<CdpClient["evm"]["importAccount"]>>;
let accountPromise: Promise<CdpServerAccount> | null = null;

function resolveResourceAccount(): Promise<CdpServerAccount> {
  if (accountPromise) return accountPromise;
  accountPromise = (async () => {
    const cdp = new CdpClient(); // reads CDP_API_KEY_ID / _SECRET / WALLET_SECRET from env
    const privateKey = process.env.RESOURCE_WALLET_PRIVATE_KEY as Hex;
    const address =
      (process.env.RESOURCE_WALLET_ADDRESS as Hex | undefined) ??
      privateKeyToAccount(privateKey).address;
    try {
      return await cdp.evm.importAccount({ privateKey, name: "resource-wallet" });
    } catch {
      // Already imported in a previous run/process — fetch the existing account.
      return await cdp.evm.getAccount({ address: getAddress(address) });
    }
  })();
  // If import fails, don't cache the rejection — allow a later retry.
  accountPromise.catch(() => {
    accountPromise = null;
  });
  return accountPromise;
}

/**
 * Issue a USDC refund to the payer of a failed call.
 * Returns a structured result instead of throwing so one bad refund doesn't
 * abort the whole worker tick.
 */
export async function initiateRefund(
  call: Span,
  opts: { dryRun?: boolean } = {}
): Promise<RefundResult> {
  const base: RefundResult = {
    ok: false,
    spanId: call.spanId,
    paymentTxHash: call.paymentTxHash,
    payer: call.payer,
    amountAtomic: call.amountAtomic,
  };

  // ---- Guards: only refund real, settled, refundable failures ----------------
  if (!call.settled)
    return { ...base, reason: "payment never settled — nothing to refund" };
  if (call.httpStatus < 400)
    return { ...base, reason: `status ${call.httpStatus} is not a failure` };
  if (!call.payer)
    return { ...base, reason: "missing payer address" };
  if (!call.amountAtomic || BigInt(call.amountAtomic) <= 0n)
    return { ...base, reason: "missing/zero refund amount" };

  const missing = missingSendCreds();
  const net = refundNetwork();

  // Everything from here is a refund *action* (preview or real send), so trace
  // it. The four eligibility guards above intentionally stay outside the span —
  // they reject non-candidates, not refunds.
  return tracer.startActiveSpan("x402.refund", async (span) => {
    span.setAttributes({
      // Required for instrumentation.ts's isOpenInferenceSpan export filter.
      "openinference.span.kind": "TOOL",
      "refund.asset": "USDC",
      "refund.network": net,
      "refund.payer": call.payer ?? "",
      "refund.amount_atomic": call.amountAtomic ?? "",
      // Links this refund back to the failed payment it compensates.
      "refund.payment_tx_hash": call.paymentTxHash ?? "",
      "refund.source_span_id": call.spanId,
      "refund.http_status": call.httpStatus,
      "refund.mode": opts.dryRun ? "dry-run" : "live",
      "refund.dry_run": opts.dryRun ?? false,
    });
    try {
      // Dry run: eligibility guards passed, so this WOULD refund — send nothing
      // on-chain. Don't require credentials (dry runs never sign), but flag if
      // any are missing so the preview shows a real run would fail.
      if (opts.dryRun) {
        span.setAttribute(
          "refund.outcome",
          missing.length ? "would-refund-blocked" : "would-refund"
        );
        return {
          ...base,
          ok: true,
          reason:
            `dry-run — would refund ${call.amountAtomic} atomic USDC to ${call.payer}` +
            (missing.length
              ? ` (WARNING: ${missing.join(", ")} not set — a real run would fail to send)`
              : ""),
        };
      }

      if (missing.length) {
        span.setAttribute("refund.outcome", "blocked-missing-creds");
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: `${missing.join(", ")} not set`,
        });
        return { ...base, reason: `${missing.join(", ")} not set` };
      }

      // ---- Send the refund transfer via CDP (server-side nonce management) ---
      const account = await resolveResourceAccount();
      const { transactionHash } = await account.transfer({
        to: getAddress(call.payer!),
        amount: BigInt(call.amountAtomic!),
        token: "usdc",
        network: net,
      });
      span.setAttribute("refund.tx_hash", transactionHash);
      span.setAttribute("refund.outcome", "sent");
      span.setStatus({ code: SpanStatusCode.OK });
      return { ...base, ok: true, refundTxHash: transactionHash };
    } catch (e) {
      // Mark the span as errored so it persists to Arize as a failed refund.
      span.recordException(e as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: String(e) });
      span.setAttribute("refund.outcome", "failed");
      return { ...base, reason: `refund tx failed: ${String(e)}` };
    } finally {
      span.end();
    }
  });
}
