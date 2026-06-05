const GRAPHQL_URL = "https://app.arize.com/graphql";

const SPANS_QUERY = `
  query FetchSpansWithEvals($projectId: ID!, $startTime: DateTime!, $endTime: DateTime!) {
    model(id: $projectId) {
      spans(
        timeRange: { start: $startTime, end: $endTime }
        first: 1000
      ) {
        edges {
          node {
            spanId
            name
            startTime
            evaluations {
              name
              label
              score
              explanation
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
`;

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

  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      authorization: apiKey,
      "space-id": spaceId,
    },
    body: JSON.stringify({
      query: SPANS_QUERY,
      variables: { projectId, startTime, endTime },
    }),
  });

  if (!res.ok) {
    return Response.json({ error: "Arize GraphQL request failed" }, { status: res.status });
  }

  const data = await res.json();

  if (data.errors) {
    return Response.json({ error: data.errors }, { status: 500 });
  }

  const spans = (data.data.model.spans.edges as any[])
    .map((edge) => ({
      spanId: edge.node.spanId,
      spanName: edge.node.name,
      startTime: edge.node.startTime,
      evaluations: edge.node.evaluations,
    }))
    .filter((span) => span.evaluations.length > 0);

  return Response.json({
    spans,
    hasMore: data.data.model.spans.pageInfo.hasNextPage,
  });
}
