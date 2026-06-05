"use client";

import { useState } from "react";
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
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }

        body {
          min-height: 100vh;
          background: #0a0a0f;
          background-image:
            radial-gradient(ellipse 80% 60% at 20% 10%, rgba(99,57,242,0.18) 0%, transparent 60%),
            radial-gradient(ellipse 60% 50% at 80% 80%, rgba(0,180,255,0.12) 0%, transparent 55%),
            radial-gradient(ellipse 50% 40% at 60% 20%, rgba(236,72,153,0.08) 0%, transparent 50%);
        }

        .card {
          backdrop-filter: blur(24px) saturate(160%);
          -webkit-backdrop-filter: blur(24px) saturate(160%);
          background: rgba(255,255,255,0.045);
          border: 1px solid rgba(255,255,255,0.09);
          border-radius: 20px;
          box-shadow:
            0 0 0 1px rgba(255,255,255,0.04) inset,
            0 32px 64px rgba(0,0,0,0.5),
            0 8px 24px rgba(0,0,0,0.3);
        }

        .badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 12px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 0.04em;
          background: rgba(255,255,255,0.07);
          border: 1px solid rgba(255,255,255,0.1);
          color: rgba(255,255,255,0.55);
        }

        textarea {
          width: 100%;
          padding: 14px 16px;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(0,0,0,0.25);
          color: rgba(255,255,255,0.9);
          font-family: inherit;
          font-size: 14px;
          line-height: 1.6;
          resize: vertical;
          outline: none;
          transition: border-color 0.2s;
          backdrop-filter: blur(8px);
        }
        textarea:focus {
          border-color: rgba(99,57,242,0.6);
          box-shadow: 0 0 0 3px rgba(99,57,242,0.12);
        }
        textarea::placeholder { color: rgba(255,255,255,0.25); }

        .btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 12px 28px;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.07);
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s ease;
          background: linear-gradient(135deg, rgba(99,57,242,0.18) 0%, rgba(56,130,255,0.14) 100%);
          color: rgba(255,255,255,0.65);
          letter-spacing: 0.02em;
          box-shadow:
            4px 4px 10px rgba(0,0,0,0.45),
            -2px -2px 8px rgba(255,255,255,0.04),
            0 1px 0 rgba(255,255,255,0.06) inset;
        }
        .btn:hover:not(:disabled) {
          color: rgba(255,255,255,0.85);
          background: linear-gradient(135deg, rgba(120,70,255,0.55) 0%, rgba(56,150,255,0.45) 100%);
          box-shadow:
            5px 5px 12px rgba(0,0,0,0.5),
            -2px -2px 8px rgba(255,255,255,0.05),
            0 1px 0 rgba(255,255,255,0.08) inset;
        }
        .btn:active:not(:disabled) {
          box-shadow:
            2px 2px 5px rgba(0,0,0,0.5),
            -1px -1px 4px rgba(255,255,255,0.03),
            0 1px 0 rgba(0,0,0,0.2) inset;
          transform: translateY(1px);
          color: rgba(255,255,255,0.55);
        }
        .btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .output {
          backdrop-filter: blur(8px);
          background: rgba(0,0,0,0.3);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 12px;
          padding: 16px 18px;
          color: rgba(255,255,255,0.82);
          font-family: 'SF Mono', 'Fira Code', monospace;
          font-size: 13.5px;
          line-height: 1.65;
          white-space: pre-wrap;
          word-break: break-word;
        }

        .dot {
          display: inline-block;
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #6339f2;
          animation: pulse 1.2s ease-in-out infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.75); }
        }

        .footer-note {
          color: rgba(255,255,255,0.28);
          font-size: 12px;
          line-height: 1.6;
        }
        .footer-note code {
          font-family: 'SF Mono', 'Fira Code', monospace;
          color: rgba(255,255,255,0.4);
          background: rgba(255,255,255,0.06);
          padding: 1px 5px;
          border-radius: 4px;
        }
      `}</style>

      <AsciiTrail />

      <main style={{
        position: "relative",
        zIndex: 1,
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 20px",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif",
      }}>
        <div className="card" style={{ width: "100%", maxWidth: 600, padding: "40px 40px 36px" }}>

          {/* Header */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
              <span className="badge">⬡ Coinbase x402</span>
              <span className="badge">▲ Vercel AI SDK</span>
              <span className="badge">◈ Arize AX</span>
            </div>
            <h1 style={{
              margin: "0 0 8px",
              fontSize: 26,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              background: "linear-gradient(135deg, #fff 30%, rgba(255,255,255,0.55) 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}>
              Hello, Paid Agent
            </h1>
            <p style={{ margin: 0, fontSize: 13.5, color: "rgba(255,255,255,0.4)", lineHeight: 1.6 }}>
              The agent verifies the RPC endpoint, pays USDC per tool call, and traces every step in Arize AX.
            </p>
          </div>

          {/* Input */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              placeholder="Ask something that needs fresh market data…"
            />
            <button className="btn" onClick={run} disabled={loading}>
              {loading ? (
                <><span className="dot" /> Running…</>
              ) : (
                <>
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0, opacity: 0.85 }}>
                    <path d="M8 1C8 1 8.6 4.4 10 5.8C11.4 7.2 15 8 15 8C15 8 11.4 8.8 10 10.2C8.6 11.6 8 15 8 15C8 15 7.4 11.6 6 10.2C4.6 8.8 1 8 1 8C1 8 4.6 7.2 6 5.8C7.4 4.4 8 1 8 1Z" fill="currentColor"/>
                  </svg>
                  Run agent
                </>
              )}
            </button>
          </div>

          {/* Output */}
          {out && (
            <div style={{ marginTop: 24 }}>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", color: "rgba(255,255,255,0.25)", textTransform: "uppercase", marginBottom: 8 }}>
                Response
              </div>
              <div className="output">{out}</div>
            </div>
          )}

          {/* Footer */}
          <div className="footer-note" style={{ marginTop: 28, paddingTop: 20, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            Open your project in <strong style={{ color: "rgba(255,255,255,0.4)" }}>Arize AX</strong> to see the full trace:
            agent → <code>checkPaymentConfig</code> → <code>x402.payment</code> (with cost) → answer.
          </div>

        </div>
      </main>
    </>
  );
}
