"use client";

import { useState } from "react";

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
    <main
      style={{
        maxWidth: 680,
        margin: "60px auto",
        padding: "0 20px",
        fontFamily: "system-ui, sans-serif",
        lineHeight: 1.5,
      }}
    >
      <h1>Hello, Paid Agent</h1>
      <p style={{ color: "#444" }}>
        Vercel · Coinbase x402 · Arize AX — the agent pays per tool call, and
        every step is traced in Arize AX.
      </p>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={3}
        style={{ width: "100%", padding: 8, fontFamily: "inherit", fontSize: 14 }}
      />
      <button
        onClick={run}
        disabled={loading}
        style={{ marginTop: 8, padding: "8px 16px", fontSize: 14, cursor: "pointer" }}
      >
        {loading ? "Running…" : "Run agent"}
      </button>
      {out && (
        <pre
          style={{
            whiteSpace: "pre-wrap",
            background: "#f5f5f5",
            padding: 12,
            marginTop: 16,
            borderRadius: 6,
          }}
        >
          {out}
        </pre>
      )}
      <p style={{ marginTop: 24, color: "#666", fontSize: 14 }}>
        Then open your project in <b>Arize AX</b> → see the trace: agent
        reasoning → tool call → <code>x402.payment</code> (with cost) → answer.
      </p>
    </main>
  );
}
