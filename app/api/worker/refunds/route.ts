/**
 * Vercel Cron target for the refund worker.
 *
 * Schedule lives in vercel.json. Vercel cron requests carry an
 * `Authorization: Bearer $CRON_SECRET` header (set CRON_SECRET in the project's
 * env). We also accept `WORKER_SECRET` so you can trigger it manually:
 *   curl -X POST localhost:3000/api/worker/refunds -H "authorization: Bearer $WORKER_SECRET"
 */
import { runRefundTick } from "@/lib/refunds/worker";

// Refunds touch the chain + Arize; never cache, always run on the server.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// How far back each tick scans. Keep >= the cron interval so nothing is missed
// (dedupe makes the overlap safe).
const LOOKBACK_MS = 15 * 60_000;

function authorized(req: Request): boolean {
  const auth = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const workerSecret = process.env.WORKER_SECRET;
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;
  if (workerSecret && auth === `Bearer ${workerSecret}`) return true;
  return false;
}

async function handle(req: Request): Promise<Response> {
  if (!authorized(req)) {
    return new Response("unauthorized", { status: 401 });
  }
  const params = new URL(req.url).searchParams;
  // Optional ?days= override for manual backfill/replay (clamped to 30d). Cron
  // calls have no query string and fall back to the default LOOKBACK_MS window.
  const daysParam = Number(params.get("days"));
  const lookbackDays =
    Number.isFinite(daysParam) && daysParam > 0
      ? Math.min(daysParam, 30)
      : LOOKBACK_MS / 86_400_000;
  // Optional ?dryRun=1|true — report what WOULD be refunded without sending USDC.
  const dryRunParam = params.get("dryRun");
  const dryRun = dryRunParam === "1" || dryRunParam === "true";
  try {
    const summary = await runRefundTick(lookbackDays, { dryRun });
    return Response.json(summary);
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

// Vercel Cron issues GET by default; allow POST for manual/local triggering.
export const GET = handle;
export const POST = handle;
