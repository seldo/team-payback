/**
 * Idempotency guard so a payment is never refunded twice — file-backed.
 *
 * Records live in a JSON file (default <cwd>/data/refunds.json, override with
 * REFUND_STORE_PATH) keyed by the payment tx hash. This survives dev-server
 * restarts and local cron, and is human-readable so you can see which spans
 * were refunded. Loaded once into memory, then write-through on every mark.
 *
 * PRODUCTION NOTE: a JSON file on disk is NOT safe for serverless (Vercel's FS
 * is ephemeral / per-instance) or for concurrent instances. For prod, swap the
 * load/persist bodies for a durable atomic store (Vercel KV / Upstash Redis
 * SETNX, Postgres unique constraint, etc.). The async interface stays the same.
 */
import { promises as fs } from "fs";
import path from "path";
import type { RefundResult } from "./refund";

interface ProcessedRecord {
  spanId: string;
  ok: boolean;
  refundTxHash?: string;
  reason?: string;
  ts: string; // ISO timestamp of when it was recorded
}

type Store = Record<string, ProcessedRecord>;

const STORE_PATH =
  process.env.REFUND_STORE_PATH ||
  path.join(process.cwd(), "data", "refunds.json");

// In-memory cache of the file. Loaded once, kept in sync by markProcessed.
let cache: Store | null = null;
// Serialize writes so concurrent marks in one tick don't clobber the file.
let writeChain: Promise<void> = Promise.resolve();

async function load(): Promise<Store> {
  if (cache) return cache;
  try {
    const raw = await fs.readFile(STORE_PATH, "utf8");
    cache = JSON.parse(raw) as Store;
  } catch (err: unknown) {
    // Missing file (first run) is expected; anything else, start empty but warn.
    if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") {
      console.warn(
        `[refund-store] could not read ${STORE_PATH}, starting empty:`,
        err
      );
    }
    cache = {};
  }
  return cache;
}

async function persist(): Promise<void> {
  const data = JSON.stringify(cache ?? {}, null, 2);
  await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
  // Atomic-ish write: tmp file then rename so a crash can't truncate the store.
  const tmp = `${STORE_PATH}.${process.pid}.tmp`;
  await fs.writeFile(tmp, data, "utf8");
  await fs.rename(tmp, STORE_PATH);
}

/** Has this payment already been refunded (or attempted)? */
export async function alreadyProcessed(paymentTxHash: string): Promise<boolean> {
  const store = await load();
  return Object.prototype.hasOwnProperty.call(store, paymentTxHash);
}

/** Record a refund attempt result against its payment tx hash. */
export async function markProcessed(
  paymentTxHash: string,
  result: RefundResult
): Promise<void> {
  const store = await load();
  store[paymentTxHash] = {
    spanId: result.spanId,
    ok: result.ok,
    refundTxHash: result.refundTxHash,
    reason: result.ok ? undefined : result.reason,
    ts: new Date().toISOString(),
  };
  // Chain writes so overlapping calls persist in order, not in parallel.
  writeChain = writeChain.then(persist, persist);
  await writeChain;
}
