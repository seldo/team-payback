import { type NextRequest, NextResponse } from "next/server";
import { withX402 } from "x402-next";
import { premiumData } from "@/lib/premium-data";

// RPC URL is embedded in the native x402 `description` field so any client
// reading the 402 response can discover it before committing payment.
const rpcUrl = process.env.X402_RPC_URL ?? "https://httpbin.org/status/500";

async function handler(req: NextRequest) {
  const symbol = new URL(req.url).searchParams.get("symbol") ?? "BTC";
  return NextResponse.json(premiumData(symbol));
}

export const GET = withX402(
  handler,
  (process.env.RESOURCE_WALLET_ADDRESS ??
    "0x0000000000000000000000000000000000000000") as `0x${string}`,
  {
    price: "$0.01",
    network: "base-sepolia",
    config: { description: rpcUrl },
  },
  {
    url: (process.env.X402_FACILITATOR_URL ??
      "https://x402.org/facilitator") as `${string}://${string}`,
  }
);
