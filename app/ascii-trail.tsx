"use client";

import { useEffect, useRef } from "react";

const CHAR_W = 11;
const CHAR_H = 17;
const RADIUS = 4;       // cells activated around cursor
const DECAY = 0.988;    // per-frame intensity multiplier (~6–8s fade)
const MIN_DRAW = 0.010; // below this intensity, skip drawing

// intensity 1→0 maps to these chars (high → low activity)
const CHARS = ["#", "%", "o", ">", "_", "."];

function intensityToChar(t: number): string {
  const i = Math.min(Math.floor((1 - t) * CHARS.length), CHARS.length - 1);
  return CHARS[i];
}

// stays in cool dark-blue range throughout, very low alpha
function intensityToColor(t: number): string {
  const r = Math.round(40  + t * 30);   // 40  → 70
  const g = Math.round(80  + t * 50);   // 80  → 130
  const b = Math.round(160 + t * 60);   // 160 → 220
  const a = (0.06 + t * 0.28).toFixed(3); // max ~0.34 alpha
  return `rgba(${r},${g},${b},${a})`;
}

export default function AsciiTrail() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    let cols = 0, rows = 0;
    let grid = new Float32Array(0);

    function resize() {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
      cols = Math.ceil(canvas.width  / CHAR_W);
      rows = Math.ceil(canvas.height / CHAR_H);
      grid = new Float32Array(cols * rows);
    }
    resize();
    window.addEventListener("resize", resize);

    function onMouseMove(e: MouseEvent) {
      const cx = Math.floor(e.clientX / CHAR_W);
      const cy = Math.floor(e.clientY / CHAR_H);
      for (let dr = -RADIUS; dr <= RADIUS; dr++) {
        for (let dc = -RADIUS; dc <= RADIUS; dc++) {
          const r = cy + dr, c = cx + dc;
          if (r < 0 || r >= rows || c < 0 || c >= cols) continue;
          const dist = Math.sqrt(dr * dr + dc * dc);
          const intensity = Math.max(0, 1 - dist / RADIUS);
          const idx = r * cols + c;
          if (intensity > grid[idx]) grid[idx] = intensity;
        }
      }
    }
    window.addEventListener("mousemove", onMouseMove);

    let raf: number;
    function render() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.font = `${CHAR_H - 2}px 'Courier New', 'SF Mono', monospace`;
      ctx.textBaseline = "top";

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const idx = r * cols + c;
          const t = grid[idx];
          if (t < MIN_DRAW) { grid[idx] = 0; continue; }
          ctx.fillStyle = intensityToColor(t);
          ctx.fillText(intensityToChar(t), c * CHAR_W, r * CHAR_H);
          grid[idx] = t * DECAY;
        }
      }
      raf = requestAnimationFrame(render);
    }
    render();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMouseMove);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 0,
      }}
    />
  );
}
