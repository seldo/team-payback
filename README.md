# ACV Hackathon Template — Hello, Paid Agent

A working starter that combines all three hackathon stacks:

- **Vercel** — Next.js (TypeScript), deploy in one click
- **Coinbase x402** — the agent pays USDC per tool call
- **Arize AX** — every step traced, then evaluated → iterated → improved

The whole point: get from clone → a running agent whose **reasoning + payment + observability** you can see in one AX trace, in well under 30 minutes — then fork it for your hack.

**Runs standalone.** In the default mock mode it needs only your **Arize + OpenAI** keys — no wallet, no Coinbase, no deploy, nothing to wait on. Live x402 payments and the Vercel deploy are optional add-ons (below).

```
User → Agent (Vercel AI SDK)
         │
         ├─ tool: checkPaymentConfig (free)
         │    reads rpcUrl from 402 description → pings eth_chainId → accessible: true/false
         │
         └─ tool: getPremiumData  (only if accessible: true)
              fetch → 402 Payment Required → auto-pay USDC → 200   (live mode)
              /api/paid-data  (x402-gated via withX402)   // or /api/data in MOCK mode
              ▼
            answer  ── traced in Arize AX: LLM → checkPaymentConfig → x402.payment (cost) ──
```

## Quick start (MOCK mode — ~5 min, no wallet needed)

`MOCK_PAYMENTS=true` (the default) skips x402 entirely so you can run the agent + the full AX loop with just two API keys — no external services.

> Requires **Node ≥ 20.9** (`.nvmrc` pins 22 — `nvm use` if you have it).

```bash
npm install
cp .env.example .env.local
# set: OPENAI_API_KEY, ARIZE_API_KEY, ARIZE_SPACE_ID, ARIZE_PROJECT_NAME   (leave MOCK_PAYMENTS=true)
npm run dev
```

Open http://localhost:3000, hit **Run agent**, then open your project in **Arize AX** → you'll see the trace: agent → `getPremiumData` → `x402.payment` (mode=mock) → answer.

> First time in AX? Get `ARIZE_API_KEY` + `ARIZE_SPACE_ID` at app.arize.com → Settings → Space API Keys.

## The Arize AX build loop (the magic)

Install the `ax` skills, then drive the loop from Cursor / Claude Code — the skills handle the `ax` flags:

```bash
uv tool install arize-ax-cli && ax profiles create
npx skills add Arize-ai/arize-skills
```

- **Trace** — already wired (`instrumentation.ts`). *"ax, export my last hello-paid-agent traces and summarize tool calls + spend."*
- **Evaluate** — *"ax, use arize-evaluator to judge: did the answer use the tool data and avoid unnecessary paid calls?"*
- **Iterate** — *"ax, use arize-dataset + arize-experiment to run my deployed agent against a dataset and score it."* (This is Agent Experimentation.)
- **Improve** — *"ax, use arize-prompt-optimization on the failing cases to propose a better prompt."*

Full walkthrough: see **📚 Learn Arize AX** below, plus the [Arize skills](https://github.com/Arize-ai/arize-skills) that drive the `ax` commands.

## 📚 Learn Arize AX (self-serve)

New to AX? These are the canonical docs — enough to get from this template to your own traced, evaluated agent without anyone walking you through it.

- **Start here:** [Arize AX docs](https://arize.com/docs/ax)
- **Get your keys** (`ARIZE_API_KEY` + `ARIZE_SPACE_ID`): [API & Service Keys](https://arize.com/docs/ax/security-and-settings/api-keys) — then grab them at **app.arize.com → Settings → Space API Keys**.

Mapped to the four-step build loop above:

| Stage | What you're doing | Docs |
|-------|-------------------|------|
| **Trace** | emit spans (already wired in `instrumentation.ts`) | [Set up traces](https://arize.com/docs/ax/get-started/get-started-tracing) · [Vercel AI SDK integration](https://arize.com/docs/ax/integrations/ts-js-agent-frameworks/vercel) — exactly what this template uses |
| **Evaluate** | score the answer + track spend | [Evals overview](https://arize.com/docs/ax/evaluate/evals-overview) |
| **Iterate** | run against a dataset / experiment | [Build a dataset](https://arize.com/docs/ax/improve/build-a-dataset) |
| **Improve** | tune the prompt on the failing cases | [Prompt Playground](https://arize.com/docs/ax/prompts/prompt-playground) |

## Optional — going live with x402 (Coinbase territory)

Not required to run or demo the template. When you want real on-chain payments:

```bash
# in .env.local
MOCK_PAYMENTS=false
AGENT_WALLET_PRIVATE_KEY=0x...   # fund with testnet USDC (Base Sepolia faucet)
RESOURCE_WALLET_ADDRESS=0x...
X402_FACILITATOR_URL=...
```
Now the agent's `checkPaymentConfig` pre-tool probes `/api/paid-data`, reads the `rpcUrl` from the 402 `accepts[0].description` (set by `withX402` in the route), verifies it's reachable via `eth_chainId`, then automatically pays and fetches. The `x402.payment` span shows `mode=live` + the on-chain result.

## Optional — deploy to Vercel

Not required — the template runs locally as-is.

```bash
vercel               # or push to GitHub + import in the Vercel dashboard
```
Set the same env vars in **Project → Settings → Environment Variables**, and update `BASE_URL` to your deployed URL.

## Project structure

```
instrumentation.ts          Arize AX tracing (registerOTel + OpenInference)  ✅ core
lib/agent.ts                Vercel AI SDK agent + paid tool + cost span      ✅ core
lib/premium-data.ts         stand-in premium data provider (swap for a real API)
app/api/agent/route.ts      POST { prompt } → runs the agent
app/api/data/route.ts       ungated premium data — used in mock (default)
app/page.tsx                minimal "try it" UI
middleware.ts               no-op pass-through (gate lives in route handler)  🔌 optional
app/api/paid-data/route.ts  x402-gated via withX402; rpcUrl in description   🔌 optional
```

## What's real vs. mocked

This repo is **standalone and build-green** — `npm install && npm run build` passes with no external setup.

- ✅ **Arize AX** — fully wired and verified: packages, exporter URL (`otlp.arize.com/v1/traces`), headers (`arize-space-id` / `arize-api-key`), and the required project-name attribute, against the [Arize Vercel AI SDK doc](https://arize.com/docs/ax/integrations/ts-js-agent-frameworks/vercel). The `ax` CLI/skill commands track `arize-ax-cli` + `arize-skills` (main). **This is the part that matters — it works today.**
- ✅ **Mock mode (default)** — runs standalone on only `OPENAI_API_KEY` + the three `ARIZE_*` vars. No wallet, no Coinbase, no deploy, nothing to wait on. The full AX trace (LLM → tool → `x402.payment` `mode=mock`) still renders.
- 🔌 **Live x402 payments (optional)** — flip `MOCK_PAYMENTS=false` + add a funded wallet. Pinned to `x402-next` / `x402-fetch` v1.2.0; the live facilitator/network/wallet specifics are Coinbase's to own and don't touch the standalone path.
- 🔌 **Vercel deploy (optional)** — `vercel` or import in the dashboard. Runs locally without it.

## Tracks
- **Track 1 (10K On-Chain Business):** make the agent reason about whether a purchase is worth it (budget + value) — extend `lib/agent.ts` and the paid tool.
- **Track 2 (10x Dev Productivity):** make the paid tool a real dev capability (premium search / real-time data) — swap `lib/premium-data.ts` for a real API.
