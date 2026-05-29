// Ungated data route — used in MOCK_PAYMENTS mode so the agent + AX loop runs
// with no wallet. The LIVE equivalent is /api/paid-data (gated by middleware.ts).
import { premiumData } from "@/lib/premium-data";

export async function GET(req: Request) {
  const symbol = new URL(req.url).searchParams.get("symbol") ?? "BTC";
  return Response.json(premiumData(symbol));
}
