import { runAgent } from "@/lib/agent";

export const maxDuration = 30; // agent + tool call + (live) payment can take a few seconds

export async function POST(req: Request) {
  try {
    const { prompt } = await req.json();
    if (!prompt) return Response.json({ error: "missing prompt" }, { status: 400 });
    const result = await runAgent(prompt);
    return Response.json({ text: result.text });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
