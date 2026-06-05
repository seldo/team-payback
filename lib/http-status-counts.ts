/**
 * Counts of successful vs failed requests over the last `days`, derived from the
 * `attributes.payment.http_status` span attribute in Arize AX.
 *
 * Arize's GraphQL API has no server-side span aggregation in this schema, and its
 * `queryFilter` does not reliably filter on this attribute, so we page through the
 * span records (max 50/page) and tally `http_status` client-side. Payment
 * status lives on child spans, so request counts are grouped by traceId.
 *
 * Reads ARIZE_API_KEY + ARIZE_SPACE_ID from the environment; the project (model)
 * id falls back to the team's project when ARIZE_PROJECT_ID is unset.
 */

const ARIZE_GRAPHQL_URL = "https://app.arize.com/graphql";
const PAGE_SIZE = 50; // Arize caps spanRecordsPublic page size at 50.

export interface RequestTally {
  success: number;
  failure: number;
}

export interface HttpStatusSpanParams {
  days?: number;
  startTime?: string;
  endTime?: string;
}

export type HttpStatusSpanInput = number | HttpStatusSpanParams | undefined;

function normalizeParams(params?: HttpStatusSpanInput): HttpStatusSpanParams {
  return typeof params === "number" ? { days: params } : params ?? {};
}

// spanRecordsPublic samples/caps its result set per request: over a wide window
// it silently drops rows (notably the payment-populated x402.payment spans we
// need). Empirically a <=60m window returns the full, stable set, so we scan in
// 60m chunks and dedupe by spanId across them.
const CHUNK_MS = 60 * 60_000;

/** Tally payment outcomes per trace/request. */
async function getHttpStatusTally(
  params?: HttpStatusSpanInput
): Promise<RequestTally> {
  const spans = await fetchHttpStatusSpans(params);
  return tallyHttpStatusByTrace(spans);
}

export function tallyHttpStatusByTrace(spans: Span[]): RequestTally {
  const byTrace = new Map<string, number[]>();

  for (const span of spans) {
    const statuses = byTrace.get(span.traceId) ?? [];
    statuses.push(span.httpStatus);
    byTrace.set(span.traceId, statuses);
  }

  let success = 0;
  let failure = 0;

  for (const statuses of byTrace.values()) {
    if (statuses.some((s) => s >= 400)) failure++;
    else success++;
  }

  return { success, failure };
}

/** Number of successful requests. Omit params for the full available project range. */
export async function getHttpSuccessCount(
  params?: HttpStatusSpanInput
): Promise<number> {
  return (await getHttpStatusTally(params)).success;
}

/** Number of failed requests. Omit params for the full available project range. */
export async function getHttpFailureCount(
  params?: HttpStatusSpanInput
): Promise<number> {
  return (await getHttpStatusTally(params)).failure;
}

export interface Span {
  traceId: string;
  spanId: string;
  name: string;
  startTime: string;
  latencyMs: number;
  statusCode: string;
  httpStatus: number;
  inputValue?: string;
  outputValue?: string;
  // Payment-correlation attributes stamped by lib/agent.ts on x402.payment spans.
  // Present only on settled live payments; the refund worker refunds from these.
  paymentTxHash?: string;
  payer?: string;
  payee?: string;
  amountAtomic?: string;
  settled?: boolean;
  network?: string;
}

const SPAN_COLUMNS = [
  "attributes.payment.http_status",
  "attributes.input.value",
  "attributes.output.value",
  "attributes.payment.tx_hash",
  "attributes.payment.payer",
  "attributes.payment.payee",
  "attributes.payment.amount_atomic",
  "attributes.payment.settled",
  "attributes.payment.network",
];

const TIME_RANGE_BUFFER_MS = 24 * 60 * 60 * 1000; // 1 day

async function getProjectTimeRange(
  apiKey: string,
  spaceId: string,
  projectId: string
): Promise<{ start: Date; end: Date }> {
  const query = `{
    node(id: ${JSON.stringify(projectId)}) {
      ... on Model { createdAt }
    }
  }`;

  const res = await fetch(ARIZE_GRAPHQL_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "space-id": spaceId,
    },
    body: JSON.stringify({ query }),
  });

  if (!res.ok) {
    throw new Error(
      `Arize GraphQL request failed: ${res.status} ${res.statusText}`
    );
  }

  const json: any = await res.json();
  if (json.errors?.length) {
    throw new Error(`Arize GraphQL error: ${JSON.stringify(json.errors)}`);
  }

  const createdAt = json?.data?.node?.createdAt;
  if (!createdAt) throw new Error("Project createdAt not found");

  return {
    start: new Date(new Date(createdAt).getTime() - TIME_RANGE_BUFFER_MS),
    end: new Date(),
  };
}

function parseDate(value: string, label: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${label} is not a valid ISO date: ${value}`);
  }
  return date;
}

/**
 * Fetch span records carrying `attributes.payment.http_status` across [start, end],
 * scanning in <=60m chunks (see CHUNK_MS) so spanRecordsPublic's per-window
 * sampling never drops the payment-populated spans. Columns are matched by name
 * (not position) and deduped by spanId across chunks/pages.
 */
async function fetchHttpStatusSpansInWindow(
  apiKey: string,
  spaceId: string,
  projectId: string,
  start: Date,
  end: Date
): Promise<Span[]> {
  const spans: Span[] = [];
  const seen = new Set<string>(); // dedupe across overlapping chunks/pages

  // Walk newest -> oldest in 60m slices. Each slice is paged independently.
  for (
    let chunkEnd = end.getTime();
    chunkEnd > start.getTime();
    chunkEnd -= CHUNK_MS
  ) {
    const chunkStart = Math.max(start.getTime(), chunkEnd - CHUNK_MS);
    await fetchWindow(
      new Date(chunkStart),
      new Date(chunkEnd),
      { apiKey, spaceId, projectId },
      spans,
      seen
    );
  }

  return spans;
}

/**
 * Page a single (<=60m) time window, appending mapped Spans to `spans` and
 * recording their ids in `seen` for cross-window dedupe.
 */
async function fetchWindow(
  start: Date,
  end: Date,
  auth: { apiKey: string; spaceId: string; projectId: string },
  spans: Span[],
  seen: Set<string>
): Promise<void> {
  const dataset =
    `startTime: ${JSON.stringify(start.toISOString())}, ` +
    `endTime: ${JSON.stringify(end.toISOString())}, ` +
    `environmentName: tracing, externalModelVersionIds: [], externalBatchIds: []`;

  let after: string | null = null;

  do {
    const afterArg = after ? `, after: ${JSON.stringify(after)}` : "";
    const query = `{
      node(id: ${JSON.stringify(auth.projectId)}) {
        ... on Model {
          spanRecordsPublic(
            first: ${PAGE_SIZE}${afterArg}
            dataset: { ${dataset} }
            columnNames: ${JSON.stringify(SPAN_COLUMNS)}
          ) {
            pageInfo { hasNextPage endCursor }
            edges {
              node {
                traceId
                spanId
                name
                startTime
                latencyMs
                statusCode
                columns {
                  name
                  value {
                    ... on NumericDimensionValue { num: value }
                    ... on CategoricalDimensionValue { cat: value }
                  }
                }
              }
            }
          }
        }
      }
    }`;

    const res = await fetch(ARIZE_GRAPHQL_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": auth.apiKey,
        "space-id": auth.spaceId,
      },
      body: JSON.stringify({ query }),
    });

    if (!res.ok) {
      throw new Error(
        `Arize GraphQL request failed: ${res.status} ${res.statusText}`
      );
    }

    // Explicit annotation breaks a TS7022 circular-inference cycle in the
    // do/while pager (afterArg -> after -> conn -> json -> res -> query).
    const json: any = await res.json();
    if (json.errors?.length) {
      throw new Error(`Arize GraphQL error: ${JSON.stringify(json.errors)}`);
    }

    const conn = json?.data?.node?.spanRecordsPublic;
    const edges: Array<{
      node: {
        traceId: string;
        spanId: string;
        name: string;
        startTime: string;
        latencyMs: number;
        statusCode: string;
        columns: Array<{ name: string; value: { num?: number; cat?: string } | null }>;
      };
    }> = conn?.edges ?? [];

    for (const { node } of edges) {
      const col = (n: string) => node.columns.find((c) => c.name === n)?.value;
      const httpStatus = col("attributes.payment.http_status")?.num;
      if (typeof httpStatus !== "number") continue; // only x402 payment spans carry it
      if (seen.has(node.spanId)) continue; // skip duplicates from pagination/chunks
      seen.add(node.spanId);

      // Payment-correlation attrs are stamped as strings (cat) by lib/agent.ts,
      // except amount_atomic which may arrive numeric depending on ingestion.
      const amount = col("attributes.payment.amount_atomic");
      const settledVal = col("attributes.payment.settled");
      spans.push({
        traceId: node.traceId,
        spanId: node.spanId,
        name: node.name,
        startTime: node.startTime,
        latencyMs: node.latencyMs,
        statusCode: node.statusCode,
        httpStatus,
        inputValue: col("attributes.input.value")?.cat || undefined,
        outputValue: col("attributes.output.value")?.cat || undefined,
        paymentTxHash: col("attributes.payment.tx_hash")?.cat || undefined,
        payer: col("attributes.payment.payer")?.cat || undefined,
        payee: col("attributes.payment.payee")?.cat || undefined,
        amountAtomic:
          amount?.cat ??
          (typeof amount?.num === "number" ? String(amount.num) : undefined),
        settled: settledVal
          ? settledVal.cat === "true" || settledVal.num === 1
          : undefined,
        network: col("attributes.payment.network")?.cat || undefined,
      });
    }

    after = conn?.pageInfo?.hasNextPage ? conn.pageInfo.endCursor : null;
  } while (after);
}

async function fetchHttpStatusSpans(
  input?: HttpStatusSpanInput
): Promise<Span[]> {
  const params = normalizeParams(input);
  const apiKey = process.env.ARIZE_API_KEY;
  const spaceId = process.env.ARIZE_SPACE_ID ?? "U3BhY2U6MzEwMjI6NERxbA==";
  const projectId = process.env.ARIZE_PROJECT_ID ?? "TW9kZWw6ODIyMzU4NzU1OTpNdkxw";

  if (!apiKey) throw new Error("ARIZE_API_KEY is not set");

  const projectWindow = await getProjectTimeRange(apiKey, spaceId, projectId);

  const end = params.endTime
    ? parseDate(params.endTime, "endTime")
    : projectWindow.end;

  const start = params.startTime
    ? parseDate(params.startTime, "startTime")
    : typeof params.days === "number"
      ? new Date(end.getTime() - params.days * 24 * 60 * 60 * 1000)
      : projectWindow.start;

  return fetchHttpStatusSpansInWindow(apiKey, spaceId, projectId, start, end);
}

/** All spans carrying an http_status (success + failure), one pass. Omit params for the full available project range. */
export async function getHttpStatusSpans(
  params?: HttpStatusSpanInput
): Promise<Span[]> {
  return fetchHttpStatusSpans(params);
}

/** Full span records for successful requests. Omit params for the full available project range. */
export async function getSuccessfulSpans(
  params?: HttpStatusSpanInput
): Promise<Span[]> {
  return (await fetchHttpStatusSpans(params)).filter((s) => s.httpStatus < 400);
}

/** Full span records for failed requests. Omit params for the full available project range. */
export async function getFailedSpans(
  params?: HttpStatusSpanInput
): Promise<Span[]> {
  return (await fetchHttpStatusSpans(params)).filter((s) => s.httpStatus >= 400);
}
