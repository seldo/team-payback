/**
 * Refund worker — one idempotent "tick".
 *
 * Pipeline: fetch failed paid calls from Arize → keep non-2xx settled payments →
 * skip anything already refunded → issue USDC refund → record. Designed to be
 * triggered by Vercel Cron (app/api/worker/refunds/route.ts) in prod or by a
 * local loop (scripts/worker.ts) in dev. Same logic, two entry points.
 */
import { getFailedSpans } from "../http-status-counts";
import { initiateRefund, type RefundResult } from "./refund";
import { alreadyProcessed, markProcessed } from "./dedupe";

export interface TickSummary {
  lookbackDays: number;
  dryRun: boolean;
  scanned: number;
  refunded: number; // in dry-run: count that WOULD be refunded
  skipped: number;
  failed: number;
  results: RefundResult[];
}

/**
 * @param lookbackDays How far back to scan Arize for failed paid calls. May be
 *   fractional (getFailedSpans multiplies it out to ms). Keep >= the cron
 *   interval so nothing is missed; dedupe makes the overlap safe.
 * @param opts.dryRun When true, evaluate every candidate and report what WOULD
 *   happen without sending any USDC or marking anything processed. Skipped spans
 *   are included in `results` (with a reason) for visibility.
 */
export async function runRefundTick(
  lookbackDays: number,
  opts: { dryRun?: boolean } = {}
): Promise<TickSummary> {
  const dryRun = opts.dryRun ?? false;
  // getFailedSpans already filters to httpStatus >= 400.
  const failures = await getFailedSpans(lookbackDays);
  const results: RefundResult[] = [];
  let refunded = 0;
  let skipped = 0;
  let failed = 0;

  for (const call of failures) {
    // Need a settlement tx hash to both refund and dedupe on. Non-settled
    // failures (no on-chain payment) have nothing to refund.
    if (!call.paymentTxHash) {
      skipped++;
      if (dryRun)
        results.push({
          ok: false,
          spanId: call.spanId,
          reason: "skipped — no settlement tx_hash (not a settled payment)",
        });
      continue;
    }
    if (await alreadyProcessed(call.paymentTxHash)) {
      skipped++;
      if (dryRun)
        results.push({
          ok: false,
          spanId: call.spanId,
          paymentTxHash: call.paymentTxHash,
          reason: "skipped — already processed",
        });
      continue;
    }

    const result = await initiateRefund(call, { dryRun });
    // Real runs: mark processed regardless of ok so a permanently-bad refund
    // isn't retried forever. Dry runs never mutate dedupe state.
    if (!dryRun) await markProcessed(call.paymentTxHash, result);
    results.push(result);
    if (result.ok) refunded++;
    else failed++;
  }

  return {
    lookbackDays,
    dryRun,
    scanned: failures.length,
    refunded,
    skipped,
    failed,
    results,
  };
}
