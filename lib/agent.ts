import { generateText, tool, stepCountIs } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { privateKeyToAccount } from "viem/accounts";
import { trace, SpanStatusCode, type Span } from "@opentelemetry/api";

const MOCK = process.env.MOCK_PAYMENTS === "true";
const tracer = trace.getTracer("paid-agent");

// $0.01 USDC (6 decimals) = 10_000 atomic units. Keep in sync with the price in
// middleware.ts. The refund worker refunds exactly this amount on failure.
const PRICE_USD = 0.01;
const AMOUNT_ATOMIC = "10000";

/**
 * In LIVE mode the resource server settles the payment and returns an
 * `X-PAYMENT-RESPONSE` header (base64 JSON) describing the on-chain settlement.
 * We decode it and stamp the span with everything the refund worker needs to
 * issue a refund: tx hash, payer (who to refund), payee, amount, settled flag.
 * Runs on BOTH success and failure paths because `paymentMiddleware` can settle
 * even when the route ultimately returns a non-2xx (the exact case we refund).
 */
async function recordSettlement(span: Span, res: Response): Promise<void> {
  if (MOCK) return;
  span.setAttribute("payment.payee", process.env.RESOURCE_WALLET_ADDRESS ?? "");
  span.setAttribute("payment.amount_atomic", AMOUNT_ATOMIC);
  const header = res.headers.get("x-payment-response");
  if (!header) {
    span.setAttribute("payment.settled", false);
    return;
  }
  try {
    const { decodeXPaymentResponse } = await import("x402-fetch");
    const settlement = decodeXPaymentResponse(header);
    span.setAttributes({
      "payment.settled": settlement.success,
      "payment.tx_hash": settlement.transaction,
      "payment.payer": settlement.payer,
      "payment.network": settlement.network,
    });
  } catch (e) {
    span.setAttribute("payment.settlement_decode_error", String(e));
  }
}

/**
 * Fetch that pays for a 402 in LIVE mode, or a plain fetch in MOCK mode.
 * x402-fetch is dynamically imported ONLY in live mode, so the default (mock)
 * path needs no wallet, no keys, and never loads anything from Coinbase.
 * (Live `wrapFetchWithPayment` + viem account shape pinned to x402-fetch v1.2.0.)
 */
async function payingFetch(url: string): Promise<Response> {
  if (MOCK) return fetch(url);
  const { wrapFetchWithPayment } = await import("x402-fetch");
  const account = privateKeyToAccount(
    process.env.AGENT_WALLET_PRIVATE_KEY as `0x${string}`
  );
  const fetchWithPay = wrapFetchWithPayment(fetch, account); // auto-pays any 402
  return fetchWithPay(url);
}

export async function runAgent(prompt: string) {
  const base = process.env.BASE_URL ?? "http://localhost:3000";
  const dataPath = MOCK ? "/api/data" : "/api/paid-data"; // MOCK → ungated route

  return generateText({
    model: openai(process.env.MODEL ?? "gpt-4o-mini"),
    prompt: `${prompt}\n\nIMPORTANT: Always call checkPaymentConfig first. Only call getPremiumData if checkPaymentConfig returns accessible: true. If accessible is false, report the error and do not pay.`,
    stopWhen: stepCountIs(5), // AI SDK v5+ multi-step (was maxSteps in v4)
    // Emits OpenInference spans → Arize AX (see instrumentation.ts).
    experimental_telemetry: { isEnabled: true, functionId: "hello-paid-agent" },
    tools: {
      // Pre-tool: probe the x402 endpoint and return config before any payment fires.
      // Always hits /api/paid-data so the rpcUrl is available even in MOCK mode.
      checkPaymentConfig: tool({
        description:
          "Check the x402 payment config (e.g. rpcUrl) before making a paid request. Always call this first.",
        inputSchema: z.object({}),
        execute: async () => {
          // Step 1: read rpcUrl from the x402 402 response description field
          const probe = await fetch(`${base}/api/paid-data`);
          if (probe.status !== 402) return { error: `Expected 402, got ${probe.status}` };
          const body = await probe.json();
          const rpcUrl = body.accepts?.[0]?.description ?? null;
          console.log("[checkPaymentConfig] rpcUrl from x402 description:", rpcUrl);

          if (!rpcUrl) return { config: null, accessible: false, error: "no rpcUrl in x402 description" };

          // Step 2: verify the RPC URL is reachable with a lightweight eth_chainId probe
          try {
            const rpcProbe = await fetch(rpcUrl, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ jsonrpc: "2.0", method: "eth_chainId", params: [], id: 1 }),
            });
            const accessible = rpcProbe.ok;
            console.log(`[checkPaymentConfig] RPC accessible: ${accessible} (HTTP ${rpcProbe.status})`);
            return { config: { rpcUrl }, accessible };
          } catch (err) {
            console.log(`[checkPaymentConfig] RPC unreachable:`, err);
            return { config: { rpcUrl }, accessible: false, error: String(err) };
          }
        },
      }),

      getPremiumData: tool({
        description:
          "Fetch premium market data for a stock or crypto symbol. Costs USDC per call — only use it after checkPaymentConfig has confirmed the config is correct.",
        inputSchema: z.object({ symbol: z.string() }), // AI SDK v5+ (was `parameters` in v4)
        execute: async ({ symbol }) =>
          // Manual span so the payment + cost shows up as its own node in AX.
          tracer.startActiveSpan("x402.payment", async (span) => {
            span.setAttributes({
              // mark as an OpenInference span so the instrumentation's spanFilter
              // (isOpenInferenceSpan) exports it to AX — otherwise the cost span is dropped.
              "openinference.span.kind": "TOOL",
              "payment.asset": "USDC",
              "payment.network": process.env.X402_NETWORK ?? "base-sepolia",
              "payment.price_usd": PRICE_USD,
              "payment.mode": MOCK ? "mock" : "live",
              "payment.resource": dataPath,
            });
            try {
              console.log(`[getPremiumData] paying for ${symbol} via ${dataPath}`);
              const res = await payingFetch(
                `${base}${dataPath}?symbol=${encodeURIComponent(symbol)}`
              );
              span.setAttribute("payment.http_status", res.status);
              console.log(`[getPremiumData] response status: ${res.status}`);
              // Stamp settlement details (tx hash, payer, amount) on EVERY path so
              // the refund worker can correlate failures → refunds in Arize.
              await recordSettlement(span, res);
              if (!res.ok) {
                const body = await res.text(); // don't assume JSON on error
                span.setAttribute("payment.error_body", body.slice(0, 500));
                throw new Error(
                  `Upstream ${dataPath} returned ${res.status}: ${body}`
                );
              }
              return await res.json();
            } catch (err) {
              console.error("[getPremiumData] tool error:", err);
              // Mark the span as errored so it persists to Arize as a failure
              // (not just a span with an http_status attribute). Records the
              // exception + sets ERROR status, then rethrows so the AI SDK tool
              // call still sees the failure.
              span.recordException(err as Error);
              span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
              throw err;
            } finally {
              span.end();
            }
          }),
      }),
    },
  });
}
