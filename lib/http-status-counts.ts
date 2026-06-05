/**
 * Counts of successful vs failed requests over the last `days`, derived from the
 * `attributes.payment.http_status` span attribute in Arize AX.
 *
 * Arize's GraphQL API has no server-side span aggregation in this schema, and its
 * `queryFilter` does not reliably filter on this attribute, so we page through the
 * span records (max 50/page) and tally `http_status` client-side. A request is
 * "successful" when its status is < 400 and "failed" when it is >= 400.
 *
 * Reads ARIZE_API_KEY + ARIZE_SPACE_ID from the environment; the project (model)
 * id falls back to the team's project when ARIZE_PROJECT_ID is unset.
 */

const ARIZE_GRAPHQL_URL = "https://app.arize.com/graphql";
const PAGE_SIZE = 50; // Arize caps spanRecordsPublic page size at 50.

/** Tally deduped http_status spans into {success, failure}. */
async function getHttpStatusTally(
  days?: number
): Promise<{ success: number; failure: number }> {
  const spans = await fetchHttpStatusSpans(days);
  let success = 0;
  let failure = 0;
  for (const s of spans) {
    if (s.httpStatus < 400) success++;
    else failure++;
  }
  return { success, failure };
}

/** Number of successful requests (HTTP status < 400). Omit `days` for the full data range. */
export async function getHttpSuccessCount(days?: number): Promise<number> {
  return (await getHttpStatusTally(days)).success;
}

/** Number of failed requests (HTTP status >= 400). Omit `days` for the full data range. */
export async function getHttpFailureCount(days?: number): Promise<number> {
  return (await getHttpStatusTally(days)).failure;
}

export interface Span {
  spanId: string;
  name: string;
  startTime: string;
  latencyMs: number;
  statusCode: string;
  httpStatus: number;
  inputValue?: string;
  outputValue?: string;
}

const SPAN_COLUMNS = [
  "attributes.payment.http_status",
  "attributes.input.value",
  "attributes.output.value",
];

// Spans can be ingested slightly before the project record's createdAt
// (ingestion-vs-creation skew), so back the window start off by this much to
// avoid dropping the earliest spans. Cheap: the query is paginated either way.
const TIME_RANGE_BUFFER_MS = 24 * 60 * 60 * 1000; // 1 day

/**
 * The project's data window, fetched dynamically (no hardcoded dates).
 * `start` is createdAt minus a skew buffer (earliest data); `end` is now
 * (always >= the latest trace). The schema has no "latest span" field, and
 * `Model.timeRange` does not exist, so this is the usable dynamic window.
 */
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

/**
 * Page through span records that carry `attributes.payment.http_status` and map
 * each into a Span. Columns are matched by name (not position) for robustness.
 * Time range is resolved dynamically from the project's data window.
 */
async function fetchHttpStatusSpans(days?: number): Promise<Span[]> {
  const apiKey = process.env.ARIZE_API_KEY;
  const spaceId = process.env.ARIZE_SPACE_ID ?? "U3BhY2U6MzEwMjI6NERxbA==";
  const projectId = process.env.ARIZE_PROJECT_ID ?? "TW9kZWw6ODIyMzU4NzU1OTpNdkxw";

  if (!apiKey) throw new Error("ARIZE_API_KEY is not set");

  // Resolve the project's actual data window dynamically. With `days`, look back
  // that many days from the latest data; without it, span the full window.
  const { start: projectStart, end } = await getProjectTimeRange(
    apiKey,
    spaceId,
    projectId
  );
  const start = days
    ? new Date(end.getTime() - days * 24 * 60 * 60 * 1000)
    : projectStart;
  const dataset =
    `startTime: ${JSON.stringify(start.toISOString())}, ` +
    `endTime: ${JSON.stringify(end.toISOString())}, ` +
    `environmentName: tracing, externalModelVersionIds: [], externalBatchIds: []`;

  const spans: Span[] = [];
  const seen = new Set<string>(); // the pager can return the same span twice
  let after: string | null = null;

  do {
    const afterArg = after ? `, after: ${JSON.stringify(after)}` : "";
    const query = `{
      node(id: ${JSON.stringify(projectId)}) {
        ... on Model {
          spanRecordsPublic(
            first: ${PAGE_SIZE}${afterArg}
            dataset: { ${dataset} }
            columnNames: ${JSON.stringify(SPAN_COLUMNS)}
          ) {
            pageInfo { hasNextPage endCursor }
            edges {
              node {
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

    // Explicit annotation breaks a TS7022 circular-inference cycle in the
    // do/while pager (afterArg -> after -> conn -> json -> res -> query).
    const json: any = await res.json();
    if (json.errors?.length) {
      throw new Error(`Arize GraphQL error: ${JSON.stringify(json.errors)}`);
    }

    const conn = json?.data?.node?.spanRecordsPublic;
    const edges: Array<{
      node: {
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
      if (seen.has(node.spanId)) continue; // skip duplicates from pagination
      seen.add(node.spanId);
      spans.push({
        spanId: node.spanId,
        name: node.name,
        startTime: node.startTime,
        latencyMs: node.latencyMs,
        statusCode: node.statusCode,
        httpStatus,
        inputValue: col("attributes.input.value")?.cat || undefined,
        outputValue: col("attributes.output.value")?.cat || undefined,
      });
    }

    after = conn?.pageInfo?.hasNextPage ? conn.pageInfo.endCursor : null;
  } while (after);

  return spans;
}

/** All spans carrying an http_status (success + failure), one pass. Omit `days` for the full data range. */
export async function getHttpStatusSpans(days?: number): Promise<Span[]> {
  return fetchHttpStatusSpans(days);
}

/** Full span records for successful requests (HTTP status < 400). Omit `days` for the full data range. */
export async function getSuccessfulSpans(days?: number): Promise<Span[]> {
  return (await fetchHttpStatusSpans(days)).filter((s) => s.httpStatus < 400);
}

/** Full span records for failed requests (HTTP status >= 400). Omit `days` for the full data range. */
export async function getFailedSpans(days?: number): Promise<Span[]> {
  return (await fetchHttpStatusSpans(days)).filter((s) => s.httpStatus >= 400);
}
