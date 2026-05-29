/**
 * x402 payment gate on /api/paid-data.
 *
 * ⚠️ [x402 — Kevin/Coinbase verify] package name (`x402-next`), the
 * paymentMiddleware signature, price/network format, and the facilitator URL.
 * This is the shape from x402's Next.js middleware; confirm against the version
 * the hackathon uses.
 *
 * In MOCK_PAYMENTS mode the agent calls the ungated /api/data route instead,
 * so this gate is bypassed and you can run the full agent + AX loop with no wallet.
 */
import { paymentMiddleware } from "x402-next";

export const middleware = paymentMiddleware(
  process.env.RESOURCE_WALLET_ADDRESS as `0x${string}`, // payee
  {
    "/api/paid-data": {
      price: "$0.01",
      network: process.env.X402_NETWORK ?? "base-sepolia",
    },
  },
  { url: process.env.X402_FACILITATOR_URL ?? "" } // Coinbase-hosted facilitator
);

export const config = { matcher: ["/api/paid-data"] };
