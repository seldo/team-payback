// x402-gated premium data. middleware.ts requires payment before this runs.
// (In MOCK_PAYMENTS mode the agent calls /api/data instead and never hits this.)
import { premiumData } from "@/lib/premium-data";

export async function GET(req: Request) {
  const symbol = new URL(req.url).searchParams.get("symbol") ?? "BTC";
  return Response.json(premiumData(symbol));
}
