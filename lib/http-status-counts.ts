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

/** Page through span records and tally http_status into {success, failure}. */
async function getHttpStatusTally(
  days: number
): Promise<{ success: number; failure: number }> {
  const apiKey = process.env.ARIZE_API_KEY;
  const spaceId = process.env.ARIZE_SPACE_ID ?? "U3BhY2U6MzEwMjI6NERxbA==";
  const projectId = process.env.ARIZE_PROJECT_ID ?? "TW9kZWw6ODIyMzU4NzU1OTpNdkxw";

  if (!apiKey) throw new Error("ARIZE_API_KEY is not set");

  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  const dataset =
    `startTime: ${JSON.stringify(start.toISOString())}, ` +
    `endTime: ${JSON.stringify(end.toISOString())}, ` +
    `environmentName: tracing, externalModelVersionIds: [], externalBatchIds: []`;

  let success = 0;
  let failure = 0;
  let after: string | null = null;

  do {
    const afterArg = after ? `, after: ${JSON.stringify(after)}` : "";
    const query = `{
      node(id: ${JSON.stringify(projectId)}) {
        ... on Model {
          spanRecordsPublic(
            first: ${PAGE_SIZE}${afterArg}
            dataset: { ${dataset} }
            columnNames: ["attributes.payment.http_status"]
          ) {
            pageInfo { hasNextPage endCursor }
            edges {
              node {
                columns { value { ... on NumericDimensionValue { num: value } } }
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

    const json = await res.json();
    if (json.errors?.length) {
      throw new Error(`Arize GraphQL error: ${JSON.stringify(json.errors)}`);
    }

    const conn = json?.data?.node?.spanRecordsPublic;
    const edges: Array<{ node: { columns: Array<{ value: { num?: number } | null }> } }> =
      conn?.edges ?? [];

    for (const edge of edges) {
      const status = edge.node.columns[0]?.value?.num;
      if (typeof status !== "number") continue; // only x402 payment spans carry it
      if (status < 400) success++;
      else failure++;
    }

    after = conn?.pageInfo?.hasNextPage ? conn.pageInfo.endCursor : null;
  } while (after);

  return { success, failure };
}

/** Number of successful requests (HTTP status < 400) in the last `days`. */
export async function getHttpSuccessCount(days = 7): Promise<number> {
  return (await getHttpStatusTally(days)).success;
}

/** Number of failed requests (HTTP status >= 400) in the last `days`. */
export async function getHttpFailureCount(days = 7): Promise<number> {
  return (await getHttpStatusTally(days)).failure;
}
