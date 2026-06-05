const GRAPHQL_URL = "https://app.arize.com/graphql";

// Discover which eval columns exist on the project. Arize exposes LLM evals as
// schema dimensions named `eval.<EvalName>.{label,score,explanation,metadata}`.
const EVAL_COLUMNS_QUERY = `
  query EvalColumns($projectId: ID!, $after: String) {
    node(id: $projectId) {
      ... on Model {
        tracingSchema {
          llmEvals(first: 20, after: $after) {
            edges { node { dimension { name } } }
            pageInfo { hasNextPage endCursor }
          }
        }
      }
    }
  }
`;

// Fetch spans, pulling the eval columns back as name/value pairs. `value` is a
// union, so each member's scalar is aliased to avoid a field-type conflict.
const SPANS_QUERY = `
  query FetchSpansWithEvals(
    $projectId: ID!
    $startTime: DateTime!
    $endTime: DateTime!
    $columnNames: [String!]
    $after: String
  ) {
    node(id: $projectId) {
      ... on Model {
        spanRecordsPublic(
          first: 50
          after: $after
          columnNames: $columnNames
          dataset: {
            startTime: $startTime
            endTime: $endTime
            environmentName: tracing
            externalModelVersionIds: []
            externalBatchIds: []
          }
        ) {
          edges {
            node {
              spanId
              name
              startTime
              columns {
                name
                value {
                  __typename
                  ... on CategoricalDimensionValue { stringValue: value }
                  ... on NumericDimensionValue { numberValue: value }
                }
              }
            }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    }
  }
`;

async function arize(query: string, variables: Record<string, unknown>, apiKey: string, spaceId: string) {
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "space-id": spaceId,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Response(
      JSON.stringify({ error: "Arize GraphQL request failed", arizeStatus: res.status, arizeBody: body }),
      { status: res.status, headers: { "Content-Type": "application/json" } }
    );
  }

  const data = await res.json();
  if (data.errors) {
    throw new Response(JSON.stringify({ error: data.errors }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
  return data.data;
}

// `eval.<EvalName>.<suffix>` → { name, suffix }
function parseEvalColumn(columnName: string) {
  const m = columnName.match(/^eval\.(.*)\.(label|score|explanation|metadata)$/);
  return m ? { name: m[1], suffix: m[2] as "label" | "score" | "explanation" | "metadata" } : null;
}

function columnValue(col: any): string | number | null {
  const v = col.value;
  if (!v) return null;
  return v.stringValue ?? v.numberValue ?? null;
}

export async function GET(req: Request) {
  const apiKey = process.env.ARIZE_API_KEY;
  const spaceId = process.env.ARIZE_SPACE_ID;
  const projectId = process.env.ARIZE_PROJECT_ID;

  if (!apiKey || !spaceId || !projectId) {
    return Response.json(
      { error: "Missing ARIZE_API_KEY, ARIZE_SPACE_ID, or ARIZE_PROJECT_ID" },
      { status: 500 }
    );
  }

  const url = new URL(req.url);
  const endTime = url.searchParams.get("endTime") ?? new Date().toISOString();
  const startTime =
    url.searchParams.get("startTime") ??
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  try {
    // 1. Discover eval column names for this project (paginated, max 20/page).
    const columnNames: string[] = [];
    let evalCursor: string | null = null;
    do {
      const data = await arize(EVAL_COLUMNS_QUERY, { projectId, after: evalCursor }, apiKey, spaceId);
      const conn = data.node?.tracingSchema?.llmEvals;
      if (!conn) break;
      for (const edge of conn.edges) columnNames.push(edge.node.dimension.name);
      evalCursor = conn.pageInfo.hasNextPage ? conn.pageInfo.endCursor : null;
    } while (evalCursor);

    // 2. Fetch spans (paginated), requesting those eval columns.
    const rawSpans: any[] = [];
    let spanCursor: string | null = null;
    do {
      const data = await arize(
        SPANS_QUERY,
        { projectId, startTime, endTime, columnNames, after: spanCursor },
        apiKey,
        spaceId
      );
      const conn = data.node?.spanRecordsPublic;
      if (!conn) break;
      rawSpans.push(...conn.edges.map((e: any) => e.node));
      spanCursor = conn.pageInfo.hasNextPage ? conn.pageInfo.endCursor : null;
    } while (spanCursor);

    // 3. Reshape flat eval columns into a per-span `evaluations` array.
    const spans = rawSpans
      .map((node) => {
        const byName: Record<string, any> = {};
        for (const col of node.columns ?? []) {
          const parsed = parseEvalColumn(col.name);
          if (!parsed) continue;
          const val = columnValue(col);
          if (val === null || val === "") continue;
          (byName[parsed.name] ??= { name: parsed.name })[parsed.suffix] = val;
        }
        return {
          spanId: node.spanId,
          spanName: node.name,
          startTime: node.startTime,
          evaluations: Object.values(byName),
        };
      })
      .filter((span) => span.evaluations.length > 0);

    return Response.json({ spans, evalColumns: columnNames });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
