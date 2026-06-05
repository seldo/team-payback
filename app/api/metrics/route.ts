// Dashboard metrics: success vs failure of payment requests, derived from
// Arize AX spans (attributes.payment.http_status). One pass over the spans.
import {
  getHttpStatusSpans,
  tallyHttpStatusByTrace,
  type Span,
} from "@/lib/http-status-counts";
import { getRefundTraceSummary } from "@/lib/refund-traces";

export const dynamic = "force-dynamic"; // always reflect the latest traces

export async function GET(req: Request) {
  const url = new URL(req.url);
  const daysParam = Number(url.searchParams.get("days"));
  const startTime = url.searchParams.get("startTime") ?? undefined;
  const endTime = url.searchParams.get("endTime") ?? undefined;
  // Valid ?days=N -> that look-back window; otherwise use the full project range.
  const days =
    Number.isFinite(daysParam) && daysParam > 0 ? daysParam : undefined;

  try {
    const spansPromise =
      startTime || endTime
        ? getHttpStatusSpans({ days, startTime, endTime })
        : getHttpStatusSpans(days);
    const [spans, refundSummary] = await Promise.all([
      spansPromise,
      getRefundTraceSummary(),
    ]);
    const { success, failure } = tallyHttpStatusByTrace(spans);
    const total = success + failure;

    const recent = [...spans]
      .sort((a, b) => +new Date(b.startTime) - +new Date(a.startTime))
      .slice(0, 12);

    const avgLatencyMs = total
      ? Math.round(spans.reduce((acc, s) => acc + s.latencyMs, 0) / total)
      : 0;

    return Response.json({
      days,
      total,
      success,
      failure,
      successRate: total ? success / total : 0,
      avgLatencyMs,
      refundSpans: refundSummary.refundSpans,
      refundTraces: refundSummary.refundTraces,
      refundStartTime: refundSummary.startTime,
      refundEndTime: refundSummary.endTime,
      recent: recent as Span[],
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
