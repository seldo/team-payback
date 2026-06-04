/**
 * x402 payment gate on /api/paid-data — OPTIONAL, live mode only.
 *
 * Default (MOCK_PAYMENTS != "false"): this gate is INERT. The agent calls the
 * ungated /api/data route, no wallet is touched, and nothing from Coinbase is
 * constructed or called — so the template runs fully standalone with just the
 * Arize + OpenAI keys.
 *
 * Live (MOCK_PAYMENTS=false): the x402 middleware is built lazily on first
 * request and enforces payment. The x402 specifics (package version, facilitator
 * URL, price/network format) are Coinbase territory — pinned to x402 v1.2.0 here.
 */
import { NextResponse, type NextRequest } from "next/server";
import { paymentMiddleware } from "x402-next";

const LIVE = process.env.MOCK_PAYMENTS === "false";

let paid: ReturnType<typeof paymentMiddleware> | null = null;
function gate() {
  if (!paid) {
    paid = paymentMiddleware(
      (process.env.RESOURCE_WALLET_ADDRESS ??
        "0x0000000000000000000000000000000000000000") as `0x${string}`,
      {
        "/api/paid-data": {
          price: "$0.01",
          // base-sepolia is the hackathon network; change if you target another chain.
          network: "base-sepolia",
        },
      },
      {
        url: (process.env.X402_FACILITATOR_URL ||
          "https://x402.org/facilitator") as `${string}://${string}`,
      }
    );
  }
  return paid;
}

export function middleware(req: NextRequest) {
  if (!LIVE) return NextResponse.next(); // standalone default — no payment, no x402 runtime
  return gate()(req);
}

export const config = { matcher: ["/api/paid-data"] };
