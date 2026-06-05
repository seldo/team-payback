// Dashboard metrics: success vs failure of payment requests, derived from
// Arize AX spans (attributes.payment.http_status). One pass over the spans.
import { getHttpStatusSpans, type Span } from "@/lib/http-status-counts";

export const dynamic = "force-dynamic"; // always reflect the latest traces

export async function GET(req: Request) {
  const daysParam = Number(new URL(req.url).searchParams.get("days"));
  // Valid ?days=N → that look-back window; otherwise undefined → full data range.
  const days =
    Number.isFinite(daysParam) && daysParam > 0 ? daysParam : undefined;

  try {
    const spans = await getHttpStatusSpans(days);
    const successful = spans.filter((s) => s.httpStatus < 400);
    const failed = spans.filter((s) => s.httpStatus >= 400);
    const total = spans.length;

    const recent = [...spans]
      .sort((a, b) => +new Date(b.startTime) - +new Date(a.startTime))
      .slice(0, 12);

    const avgLatencyMs = total
      ? Math.round(spans.reduce((acc, s) => acc + s.latencyMs, 0) / total)
      : 0;

    return Response.json({
      days,
      total,
      success: successful.length,
      failure: failed.length,
      successRate: total ? successful.length / total : 0,
      avgLatencyMs,
      recent: recent as Span[],
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
