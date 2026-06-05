"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import AsciiTrail from "./ascii-trail";

export default function Home() {
  const [prompt, setPrompt] = useState(
    "What's the current price of BTC? Use the data tool."
  );
  const [out, setOut] = useState("");
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    setOut("");
    try {
      const r = await fetch("/api/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const j = await r.json();
      setOut(j.text ?? JSON.stringify(j, null, 2));
    } catch (e) {
      setOut(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <AsciiTrail />

      <main className="relative z-10 mx-auto max-w-2xl px-6 py-16">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">Hello, Paid Agent</h1>
          <Link
            href="/dashboard"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Dashboard <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Vercel · Coinbase x402 · Arize AX — the agent pays per tool call, and
          every step is traced in Arize AX.
        </p>

        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          className="mt-6 w-full resize-y rounded-lg border border-border bg-card p-3 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />

        {/* Neumorphic run button */}
        <button
          onClick={run}
          disabled={loading}
          style={{
            marginTop: 12,
            width: "100%",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: "12px 28px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.07)",
            fontSize: 14,
            fontWeight: 500,
            cursor: loading ? "not-allowed" : "pointer",
            letterSpacing: "0.02em",
            transition: "all 0.15s ease",
            background: "linear-gradient(135deg, rgba(99,57,242,0.18) 0%, rgba(56,130,255,0.14) 100%)",
            color: "rgba(255,255,255,0.65)",
            boxShadow: "4px 4px 10px rgba(0,0,0,0.45), -2px -2px 8px rgba(255,255,255,0.04), 0 1px 0 rgba(255,255,255,0.06) inset",
            opacity: loading ? 0.4 : 1,
          }}
          onMouseEnter={e => {
            if (loading) return;
            const el = e.currentTarget;
            el.style.background = "linear-gradient(135deg, rgba(120,70,255,0.55) 0%, rgba(56,150,255,0.45) 100%)";
            el.style.color = "rgba(255,255,255,0.85)";
            el.style.boxShadow = "5px 5px 12px rgba(0,0,0,0.5), -2px -2px 8px rgba(255,255,255,0.05), 0 1px 0 rgba(255,255,255,0.08) inset";
          }}
          onMouseLeave={e => {
            const el = e.currentTarget;
            el.style.background = "linear-gradient(135deg, rgba(99,57,242,0.18) 0%, rgba(56,130,255,0.14) 100%)";
            el.style.color = "rgba(255,255,255,0.65)";
            el.style.boxShadow = "4px 4px 10px rgba(0,0,0,0.45), -2px -2px 8px rgba(255,255,255,0.04), 0 1px 0 rgba(255,255,255,0.06) inset";
          }}
          onMouseDown={e => {
            const el = e.currentTarget;
            el.style.transform = "translateY(1px)";
            el.style.boxShadow = "2px 2px 5px rgba(0,0,0,0.5), -1px -1px 4px rgba(255,255,255,0.03), 0 1px 0 rgba(0,0,0,0.2) inset";
          }}
          onMouseUp={e => {
            const el = e.currentTarget;
            el.style.transform = "";
          }}
        >
          {loading ? (
            <>
              <span style={{
                display: "inline-block", width: 7, height: 7, borderRadius: "50%",
                background: "#6339f2", animation: "neuPulse 1.2s ease-in-out infinite",
              }} />
              Running…
            </>
          ) : (
            <>
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, opacity: 0.85 }}>
                <path d="M8 1C8 1 8.6 4.4 10 5.8C11.4 7.2 15 8 15 8C15 8 11.4 8.8 10 10.2C8.6 11.6 8 15 8 15C8 15 7.4 11.6 6 10.2C4.6 8.8 1 8 1 8C1 8 4.6 7.2 6 5.8C7.4 4.4 8 1 8 1Z" fill="currentColor" />
              </svg>
              Run agent
            </>
          )}
        </button>

        <style>{`
          @keyframes neuPulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.4; transform: scale(0.75); }
          }
        `}</style>

        {out && (
          <Card className="mt-6">
            <CardContent className="py-4">
              <pre className="whitespace-pre-wrap font-mono text-sm">{out}</pre>
            </CardContent>
          </Card>
        )}
        <p style={{ marginTop: 24, color: "#666", fontSize: 14 }}>
          Then open your project in <b>Arize AX</b> → see the trace: agent
          reasoning → tool call → <code>x402.payment</code> (with cost) → answer.
        </p>
      </main>
    </>
  );
}
