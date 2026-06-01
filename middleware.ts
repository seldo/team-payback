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
      // x402-next types `network` as a fixed union; base-sepolia is the hackathon network.
      // Change this literal if you target a different chain.
      network: "base-sepolia",
    },
  },
  // ⚠️ [x402 — Kevin] confirm the real facilitator URL. Default is the public x402 testnet facilitator.
  {
    url: (process.env.X402_FACILITATOR_URL ||
      "https://x402.org/facilitator") as `${string}://${string}`,
  }
);

export const config = { matcher: ["/api/paid-data"] };
