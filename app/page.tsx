"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

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
    <main className="mx-auto max-w-2xl px-6 py-16">
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
      <Button onClick={run} disabled={loading} className="mt-3">
        {loading ? "Running…" : "Run agent"}
      </Button>

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
  );
}
