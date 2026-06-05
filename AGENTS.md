# AGENTS.md

Architecture and agent context for the Coinbase x402 × Arize AX hackathon template.

## Overview

A Next.js app where an LLM agent pays per tool call using the x402 HTTP payment protocol (USDC on Base). Every step — config check, payment, LLM call — is traced in Arize AX via OpenTelemetry.

## Environment Modes

Controlled by `MOCK_PAYMENTS` in `.env.local`:

| Value | Behavior |
|---|---|
| `true` | Agent hits `/api/data` (ungated). No wallet, no x402 runtime loaded. |
| `false` | Agent hits `/api/paid-data` (x402-gated). Wallet + facilitator required. |

## Request Flow (LIVE mode)

```
POST /api/agent
  └─ runAgent()
       ├─ tool: checkPaymentConfig      ← probes /api/paid-data, reads rpcUrl from accepts[0].description
       │                                   pings rpcUrl with eth_chainId — if 200, accessible: true
       └─ tool: getPremiumData          ← only called if accessible: true; pays via wrapFetchWithPayment
            └─ payingFetch()
                 ├─ GET /api/paid-data  ← withX402 returns 402 with rpcUrl in description
                 ├─ x402-fetch pays USDC via facilitator
                 └─ GET /api/paid-data  ← 200, returns market data
```

## UI Flow

`app/page.tsx` is a plain prompt → run → answer UI. No confirmation gate — the agent handles RPC verification automatically via `checkPaymentConfig` before any payment fires.

## Key Files

| File | Purpose |
|---|---|
| `middleware.ts` | No-op pass-through. x402 gate lives in the route handler, not here. |
| `app/api/paid-data/route.ts` | x402-gated via `withX402`. Embeds `rpcUrl` in the native `description` field of the 402 `accepts[]` entry — no middleware interception needed. |
| `lib/agent.ts` | `runAgent()`: two-tool agent — `checkPaymentConfig` (pre-tool) + `getPremiumData` (paid). |
| `lib/premium-data.ts` | Mock premium data provider. Replace with a real paid API. |
| `app/api/agent/route.ts` | POST handler that calls `runAgent()`. |
| `app/api/data/route.ts` | Ungated equivalent used in MOCK mode. |
| `app/page.tsx` | Minimal prompt → run → answer UI. No user confirmation gate. |
| `instrumentation.ts` | Registers OpenTelemetry → Arize AX exporter via `@vercel/otel`. |

## Agent Tools (`lib/agent.ts`)

### `checkPaymentConfig`
- **When**: Always called first, before any payment.
- **What**: (1) Plain `fetch` to `/api/paid-data` — reads `rpcUrl` from `accepts[0].description` in the 402. (2) POSTs `eth_chainId` to the rpcUrl — if HTTP 200, returns `{ config: { rpcUrl }, accessible: true }`.
- **Why**: Automatic pre-payment gate. If `accessible: false`, the agent reports the error and skips payment entirely.
- **Cost**: Free — no wallet involved.

### `getPremiumData`
- **When**: After `checkPaymentConfig` confirms config is correct.
- **Input**: `{ symbol: string }` — e.g. `"BTC"`, `"ETH"`.
- **What**: Calls `payingFetch()` which wraps `fetch` with `wrapFetchWithPayment` (x402-fetch v1.2.0). Auto-pays the 402 via the x402 facilitator, retries with `X-PAYMENT` header, returns market data JSON.
- **Cost**: $0.01 USDC per call on Base Sepolia.
- **Tracing**: Emits an `x402.payment` OpenTelemetry span tagged `openinference.span.kind: TOOL` — visible in Arize AX with `payment.price_usd`, `payment.asset`, `payment.network`, `payment.http_status`.

## x402 Response Shape

Every 402 from `/api/paid-data` uses the native x402 `description` field (set via `withX402` `config.description`) to carry the rpcUrl — no middleware interception or custom fields needed:

```json
{
  "x402Version": 1,
  "error": "X-PAYMENT header is required",
  "accepts": [{
    "scheme": "exact",
    "network": "base-sepolia",
    "maxAmountRequired": "10000",
    "description": "https://sepolia.base.org/",
    "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    "payTo": "<RESOURCE_WALLET_ADDRESS>"
  }]
}
```

`description` is a standard x402 field. `checkPaymentConfig` reads it as `body.accepts[0].description`. The UI probe reads the same field. To change the rpcUrl, set `X402_RPC_URL` in `.env.local` — the route picks it up at startup.

## Tracing (Arize AX)

`instrumentation.ts` uses `OpenInferenceSimpleSpanProcessor` with `spanFilter: isOpenInferenceSpan` — only spans tagged with `openinference.span.kind` are exported to Arize. This includes:

- The LLM call span (emitted automatically by `@ai-sdk/openai` + `experimental_telemetry`)
- The `x402.payment` tool span (emitted manually in `getPremiumData`)

To view traces: Arize AX → project `acv-hackathon-agent` (or `$ARIZE_PROJECT_NAME`).

## Required Environment Variables

| Variable | Required | Description |
|---|---|---|
| `OPENAI_API_KEY` | Always | LLM provider key |
| `MOCK_PAYMENTS` | Always | `true` for mock, `false` for live x402 |
| `BASE_URL` | Always | App base URL, e.g. `http://localhost:3000` |
| `ARIZE_API_KEY` | For tracing | Arize AX API key |
| `ARIZE_SPACE_ID` | For tracing | Base64 Arize space ID |
| `ARIZE_PROJECT_NAME` | For tracing | Defaults to `acv-hackathon-agent` |
| `RESOURCE_WALLET_ADDRESS` | Live only | Wallet that receives USDC payments |
| `AGENT_WALLET_PRIVATE_KEY` | Live only | Wallet that sends USDC payments |
| `X402_FACILITATOR_URL` | Live only | Defaults to `https://x402.org/facilitator` |
| `X402_NETWORK` | Live only | Defaults to `base-sepolia` |
| `X402_RPC_URL` | Live only | RPC URL embedded in the 402 `description` field. Defaults to `https://sepolia.base.org/` |

## Extending

- **Real data source**: Replace `lib/premium-data.ts` with a real paid API (e.g. CoinGecko, Polygon.io).
- **New paid endpoints**: Add routes under `app/api/` and extend the `paymentMiddleware` config in `middleware.ts`.
- **Config validation**: `checkPaymentConfig` verifies reachability via `eth_chainId`. Extend it with URL allowlists or signature checks as needed.
- **New paid endpoints**: Add routes under `app/api/` and wrap each with `withX402` — set `config.description` to the rpcUrl for that endpoint.
- **Multi-step payments**: Increase `stopWhen: stepCountIs(5)` and add more tools to build richer paid agent loops.
