# ACV Hackathon Template — Hello, Paid Agent

A working starter that combines all three hackathon stacks:

- **Vercel** — Next.js (TypeScript), deploy in one click
- **Coinbase x402** — the agent pays USDC per tool call
- **Arize AX** — every step traced, then evaluated → iterated → improved

The whole point: get from clone → a running agent whose **reasoning + payment + observability** you can see in one AX trace, in well under 30 minutes — then fork it for your hack.

```
User → Agent (Vercel AI SDK)
         │  decides it needs data
         ▼
       tool: getPremiumData
         │  fetch → 402 Payment Required → auto-pay USDC → 200   (live mode)
         ▼
       /api/paid-data  (x402-gated)        // or /api/data, ungated, in MOCK mode
         ▼
       answer  ── traced in Arize AX: LLM span → tool span → x402.payment (cost) ──
```

## Quick start (MOCK mode — ~5 min, no wallet needed)

`MOCK_PAYMENTS=true` skips x402 entirely so you can run the agent + the full AX loop with just two API keys.

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

## Going live with x402

```bash
# in .env.local
MOCK_PAYMENTS=false
AGENT_WALLET_PRIVATE_KEY=0x...   # fund with testnet USDC (Base Sepolia faucet)
RESOURCE_WALLET_ADDRESS=0x...
X402_FACILITATOR_URL=...
```
Now the agent's tool call hits the x402-gated `/api/paid-data`, pays, and the `x402.payment` span shows `mode=live` + the on-chain result.

## Deploy to Vercel

```bash
vercel               # or push to GitHub + import in the Vercel dashboard
```
Set the same env vars in **Project → Settings → Environment Variables**, and update `BASE_URL` to your deployed URL.

## Project structure

```
instrumentation.ts          Arize AX tracing (registerOTel + OpenInference)  ✅ verified
middleware.ts               x402 gate on /api/paid-data                       ⚠️ x402
lib/agent.ts                Vercel AI SDK agent + paid tool + cost span
lib/premium-data.ts         stand-in premium data provider (swap for a real API)
app/api/agent/route.ts      POST { prompt } → runs the agent
app/api/paid-data/route.ts  x402-gated premium data (live)
app/api/data/route.ts       ungated premium data (mock)
app/page.tsx                minimal "try it" UI
```

## What's verified vs. TBD

- ✅ **Arize AX instrumentation** — packages, exporter URL (`otlp.arize.com/v1/traces`), headers (`arize-space-id` / `arize-api-key`), and the required `model_id` project attribute are verified against the [Arize Vercel AI SDK doc](https://arize.com/docs/ax/integrations/ts-js-agent-frameworks/vercel). The `ax` CLI/skill commands are verified against `arize-ax-cli` + `arize-skills` (main).
- ⚠️ **x402** (Kevin / Coinbase) — `x402-next` / `x402-fetch` package **versions + APIs**, the facilitator URL, and the wallet/account shape. Pin these before the dry-run.
- ⚠️ **Vercel** (Glenn) — host this repo + add a one-click **Deploy** button; confirm the runtime.
- ⏳ **Not yet built/run green:** a clean `npm install && npm run build` depends on the x402 versions above. Once Kevin pins them, run it and lock the lockfile.

## Tracks
- **Track 1 (10K On-Chain Business):** make the agent reason about whether a purchase is worth it (budget + value). See cookbook 02.
- **Track 2 (10x Dev Productivity):** make the paid tool a dev capability (premium search / real-time data). See cookbook 03.
