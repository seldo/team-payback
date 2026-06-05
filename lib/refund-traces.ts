const ARIZE_SPANS_URL = "https://api.arize.com/v2/spans";
const DEFAULT_PROJECT_ID = "TW9kZWw6ODIyMzU4NzU1OTpNdkxw";
const DEFAULT_LIMIT = 100;
const DEFAULT_LOOKBACK_MS = 24 * 60 * 60 * 1000;

const REFUND_FILTER = "name contains 'refund'";

export interface RefundTraceCountParams {
  startTime?: string;
  endTime?: string;
  filter?: string;
  limit?: number;
  projectId?: string;
}

interface ArizeSpan {
  trace_id?: string;
  "context.trace_id"?: string;
  context?: {
    trace_id?: string;
  };
}

interface ArizeSpansResponse {
  spans?: ArizeSpan[];
  next_cursor?: string;
  end_cursor?: string;
  pagination?: {
    next_cursor?: string;
    end_cursor?: string;
  };
}

export interface RefundTraceSummary {
  refundSpans: number;
  refundTraces: number;
  traceIds: string[];
  startTime: string;
  endTime: string;
}

/** Fetch refund-matching spans from Arize and return the number of unique traces. */
export async function getRefundTraceCount(
  params: RefundTraceCountParams = {}
): Promise<number> {
  return (await getRefundTraceSummary(params)).refundTraces;
}

/** Fetch refund-matching spans from Arize and return span count plus deduped trace IDs. */
export async function getRefundTraceSummary(
  params: RefundTraceCountParams = {}
): Promise<RefundTraceSummary> {
  const apiKey = process.env.ARIZE_API_KEY;
  const projectId = params.projectId ?? process.env.ARIZE_PROJECT_ID ?? DEFAULT_PROJECT_ID;

  if (!apiKey) throw new Error("ARIZE_API_KEY is not set");

  const endTime = params.endTime ?? new Date().toISOString();
  const startTime =
    params.startTime ??
    new Date(new Date(endTime).getTime() - DEFAULT_LOOKBACK_MS).toISOString();

  const limit = params.limit ?? DEFAULT_LIMIT;
  const payload: Record<string, unknown> = {
    project_id: projectId,
    filter: params.filter ?? REFUND_FILTER,
    start_time: startTime,
    end_time: endTime,
  };

  const allSpans: ArizeSpan[] = [];
  let cursor: string | undefined;

  do {
    const url = new URL(ARIZE_SPANS_URL);
    url.searchParams.set("limit", String(limit));
    if (cursor) url.searchParams.set("cursor", cursor);

    const res = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(
        `Arize spans request failed: ${res.status} ${res.statusText}`
      );
    }

    const data = (await res.json()) as ArizeSpansResponse;
    allSpans.push(...(data.spans ?? []));
    cursor =
      data.next_cursor ??
      data.end_cursor ??
      data.pagination?.next_cursor ??
      data.pagination?.end_cursor;
  } while (cursor);

  const traceIds = Array.from(
    new Set(
      allSpans
        .map(
          (span) =>
            span.trace_id ?? span["context.trace_id"] ?? span.context?.trace_id
        )
        .filter((traceId): traceId is string => Boolean(traceId))
    )
  ).sort();

  return {
    refundSpans: allSpans.length,
    refundTraces: traceIds.length,
    traceIds,
    startTime,
    endTime,
  };
}
