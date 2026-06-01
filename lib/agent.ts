import { generateText, tool, stepCountIs } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { privateKeyToAccount } from "viem/accounts";
import { trace } from "@opentelemetry/api";

const MOCK = process.env.MOCK_PAYMENTS === "true";
const tracer = trace.getTracer("paid-agent");

/**
 * Fetch that pays for a 402 in LIVE mode, or a plain fetch in MOCK mode.
 * ⚠️ [x402 — Kevin/Coinbase verify] `wrapFetchWithPayment` signature + the
 * viem account shape. Dynamically imported so MOCK mode needs no wallet/keys.
 */
async function payingFetch(url: string): Promise<Response> {
  if (MOCK) return fetch(url);
  const { wrapFetchWithPayment } = await import("x402-fetch");
  const account = privateKeyToAccount(
    process.env.AGENT_WALLET_PRIVATE_KEY as `0x${string}`
  );
  const fetchWithPay = wrapFetchWithPayment(fetch, account); // auto-pays any 402
  return fetchWithPay(url);
}

export async function runAgent(prompt: string) {
  const base = process.env.BASE_URL ?? "http://localhost:3000";
  const dataPath = MOCK ? "/api/data" : "/api/paid-data"; // MOCK → ungated route

  return generateText({
    model: openai(process.env.MODEL ?? "gpt-4o-mini"),
    prompt,
    stopWhen: stepCountIs(5), // AI SDK v5+ multi-step (was maxSteps in v4)
    // Emits OpenInference spans → Arize AX (see instrumentation.ts).
    experimental_telemetry: { isEnabled: true, functionId: "hello-paid-agent" },
    tools: {
      getPremiumData: tool({
        description:
          "Fetch premium market data for a stock or crypto symbol. Costs USDC per call — only use it when the question needs fresh/accurate data.",
        inputSchema: z.object({ symbol: z.string() }), // AI SDK v5+ (was `parameters` in v4)
        execute: async ({ symbol }) =>
          // Manual span so the payment + cost shows up as its own node in AX.
          tracer.startActiveSpan("x402.payment", async (span) => {
            span.setAttributes({
              // mark as an OpenInference span so the instrumentation's spanFilter
              // (isOpenInferenceSpan) exports it to AX — otherwise the cost span is dropped.
              "openinference.span.kind": "TOOL",
              "payment.asset": "USDC",
              "payment.network": process.env.X402_NETWORK ?? "base-sepolia",
              "payment.price_usd": 0.01,
              "payment.mode": MOCK ? "mock" : "live",
              "payment.resource": dataPath,
            });
            try {
              const res = await payingFetch(
                `${base}${dataPath}?symbol=${encodeURIComponent(symbol)}`
              );
              span.setAttribute("payment.http_status", res.status);
              return await res.json();
            } finally {
              span.end();
            }
          }),
      }),
    },
  });
}
