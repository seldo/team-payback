# Team Payback — Pay Only for Good Answers

**Eval-gated x402 payments with automatic chargebacks.** A working starter that combines all
three hackathon stacks:

- **Coinbase x402** — the agent pays USDC per tool call, **with the response's quality guarantee attached**
- **Arize AX** — every response is traced and evaluated in parallel; a failing eval triggers a refund
- **Vercel** — Next.js (TypeScript), deploy in one click

The whole point: get from clone → a running agent where **payment is contingent on the
response passing its evals** — reasoning, payment, evaluation, and (if needed) the chargeback,
all visible in one AX trace, in well under 30 minutes — then fork it for your hack.

**Runs standalone.** In the default mock mode it needs only your **Arize + OpenAI** keys — no
wallet, no Coinbase, no deploy, nothing to wait on. Live x402 payments, the eval-driven
chargeback, and the Vercel deploy are optional add-ons (below).

```
User → Agent (Vercel AI SDK)
         │  decides it needs data
         ▼
       tool: getPremiumData
         │  fetch → 402 Payment Required
         │           └─ challenge advertises: price + eval metadata URL     ← agent fetches JSON to inspect before paying
         │  client confirms → auto-pay USDC → 200   (live mode)
         ▼
       /api/paid-data  (x402-gated)        // or /api/data, ungated, in MOCK mode
         │
         ├─► response returned to the user
         │
         └─► Arize AX eval runs IN PARALLEL
                  ├─ pass → done
                  └─ fail (or non-200 error) → chargeback: on-chain USDC refund → payer
       ── all traced in AX: LLM span → tool span → x402.payment → eval → (refund) ──
```

## How eval-gated payment works

x402 on its own is "pay per call." Team Payback adds a quality guarantee, so it becomes **"pay
only for responses that pass quality checks."** Four stages:

1. **Inspect** — the `402 Payment Required` challenge carries more than price + network: it
   advertises a URL to a **JSON eval metadata endpoint** that describes the eval suite + metric
   thresholds the response will be judged against. The agent fetches this endpoint to read the
   quality bar *before* committing funds.
2. **Pay & honor** — the client confirms and x402 settles the USDC payment; the server honors
   the request and returns the response **immediately**. The eval never blocks the response.
3. **Evaluate in parallel** — as the response goes back, an Arize AX eval framework scores it
   against the advertised metrics (loaded from the same JSON endpoint), asynchronously.
4. **Chargeback** — on **pass**, nothing further happens. On **fail**, an on-chain USDC refund
   is issued from the resource wallet back to the payer. A non-`200` response from the server
   (an error rather than a delivered answer) also counts as a fail and triggers the same refund
   — you never pay for an errored request.

The trust model: the buyer's downside is bounded — they only end up paying for answers that
clear the bar, and bad answers pay themselves back.

## Quick start (MOCK mode — ~5 min, no wallet needed)

`MOCK_PAYMENTS=true` (the default) skips x402 entirely so you can run the agent + the full AX
loop with just two API keys — no external services.

> Requires **Node ≥ 20.9** (`.nvmrc` pins 22 — `nvm use` if you have it).

```bash
npm install
cp .env.example .env.local
# set: OPENAI_API_KEY, ARIZE_API_KEY, ARIZE_SPACE_ID, ARIZE_PROJECT_NAME   (leave MOCK_PAYMENTS=true)
npm run dev
```

Open http://localhost:3000, hit **Run agent**, then open your project in **Arize AX** → you'll
see the trace: agent → `getPremiumData` → `x402.payment` (mode=mock) → the eval span (a
simulated pass in mock) → answer.

> First time in AX? Get `ARIZE_API_KEY` + `ARIZE_SPACE_ID` at app.arize.com → Settings → Space API Keys.

## The Arize AX build loop (the magic)

Install the `ax` skills, then drive the loop from Cursor / Claude Code — the skills handle the `ax` flags:

```bash
uv tool install arize-ax-cli && ax profiles create
npx skills add Arize-ai/arize-skills
```

- **Trace** — already wired (`instrumentation.ts`). *"ax, export my last team-payback traces and summarize tool calls + spend."*
- **Evaluate** — this is the load-bearing step: the eval here is the **same suite that gates payment** (advertised in the 402 challenge as a JSON endpoint and run in parallel after each response). *"ax, use arize-evaluator to judge: did the answer use the tool data and avoid unnecessary paid calls?"* — failing this is what triggers a chargeback.
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
| **Evaluate** | score the answer + track spend — **these evals drive the chargeback decision** | [Evals overview](https://arize.com/docs/ax/evaluate/evals-overview) |
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
Now the agent's tool call hits the x402-gated `/api/paid-data`, pays, and the `x402.payment`
span shows `mode=live` + the on-chain result. (In mock mode the `middleware.ts` gate is inert
and nothing here is loaded.)

### Live chargebacks (the Payback part)

A live refund means the resource wallet must be able to *send* USDC, not just receive it — so
going fully live additionally needs:

```bash
# in .env.local — DESIGN / not yet wired in code (README-only at this stage)
RESOURCE_WALLET_PRIVATE_KEY=0x...   # so the resource wallet can refund the payer on eval failure
EVAL_CHARGEBACK_THRESHOLD=0.5       # eval score below this → on-chain USDC refund → payer
```
On an eval failure — or any non-`200` response from the server — the resource wallet issues an
on-chain USDC transfer back to the payer on Base Sepolia. In mock mode the eval "passes" by
default and no refund is attempted.

## Optional — deploy to Vercel

Not required — the template runs locally as-is.

```bash
vercel               # or push to GitHub + import in the Vercel dashboard
```
Set the same env vars in **Project → Settings → Environment Variables** (including the eval /
refund vars above if you're running live chargebacks), and update `BASE_URL` to your deployed URL.

## Project structure

```
instrumentation.ts          Arize AX tracing (registerOTel + OpenInference)  ✅ core
lib/agent.ts                Vercel AI SDK agent + paid tool + cost span      ✅ core
                              └─ where the parallel eval trigger plugs in, alongside x402.payment
lib/premium-data.ts         stand-in premium data provider (swap for a real API)
app/api/agent/route.ts      POST { prompt } → runs the agent
app/api/data/route.ts       ungated premium data — used in mock (default)
app/page.tsx                minimal "try it" UI
middleware.ts               x402 gate — INERT in mock, lazy in live          🔌 optional
                              └─ where the eval advert (402 challenge) + refund logic plug in
app/api/paid-data/route.ts  x402-gated premium data (live only)              🔌 optional
```

## What's real vs. mocked

This repo is **standalone and build-green** — `npm install && npm run build` passes with no external setup.

- ✅ **Arize AX** — fully wired and verified: packages, exporter URL (`otlp.arize.com/v1/traces`), headers (`arize-space-id` / `arize-api-key`), and the required project-name attribute, against the [Arize Vercel AI SDK doc](https://arize.com/docs/ax/integrations/ts-js-agent-frameworks/vercel). The `ax` CLI/skill commands track `arize-ax-cli` + `arize-skills` (main). **This is the part that matters — it works today.**
- ✅ **Mock mode (default)** — runs standalone on only `OPENAI_API_KEY` + the three `ARIZE_*` vars. No wallet, no Coinbase, no deploy, nothing to wait on. The full AX trace (LLM → tool → `x402.payment` `mode=mock` → eval pass) still renders.
- 🔌 **Live x402 payments (optional)** — flip `MOCK_PAYMENTS=false` + add a funded wallet. Pinned to `x402-next` / `x402-fetch` v1.2.0; the live facilitator/network/wallet specifics are Coinbase's to own and don't touch the standalone path.
- 🔌 **Eval-gating + chargebacks (design / optional)** — the 402 challenge advertises a URL to a JSON eval metadata endpoint; the agent fetches it to read the eval suite + metric thresholds before paying, and the same metadata drives the parallel Arize eval and on-chain USDC refund on failure. The live refund path is the part you'll implement. The template still runs standalone and build-green in mock mode (eval passes, no refund).
- 🔌 **Vercel deploy (optional)** — `vercel` or import in the dashboard. Runs locally without it.
