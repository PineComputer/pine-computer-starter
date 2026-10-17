// What this app keeps about its Computer, in one JSON file under .data/.
//
// A real product keeps the same records in its own database, one set per user.
// The Computer's credentials, its binding and the session token are secrets: they
// are sealed with AES-GCM under STARTER_SECRET and never leave the server.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export const DATA_DIR = path.join(process.cwd(), ".data");
const FILE = path.join(DATA_DIR, "store.json");

/** A secret, encrypted: base64 of iv (12 bytes), ciphertext and tag. */
type Sealed = string;

export interface ComputerRecord {
  id: string;
  /** Credentials.serialize(): start this Computer again and decrypt its saved state. */
  credentials: Sealed;
  /** Binding.serialize(): reach the runtime it's running in. Replaced on every Start. */
  binding: Sealed;
  /** The binding's revision. A binding is saved only over an older one. */
  bindingRevision: string;
}

export interface SessionRecord {
  name: string;
  /** The session token from createSession: drives the session (runs, answers). */
  token: Sealed;
  /** The binding revision the session was created under; Start ends every session. */
  bindingRevision: string;
}

export interface TurnFile {
  path: string;
  size: number;
  contentType: string;
}

/** One turn of the agent's work, as this app remembers it after the Computer stops. */
export interface TurnRecord {
  turnId: string;
  /** The idempotency key the run was sent with: sending it again returns this turn. */
  runKey: string;
  /** run: your task; answer: your answer to its question, which opened this turn. */
  kind: "run" | "answer";
  /** What you asked, or your answer. */
  ask: string;
  askedAt: string;
  /** running | needs_input | completed | failed | canceled */
  state: string;
  summary?: string;
  endedAt?: string;
  durationMs?: number;
  /** The turn's rated cost in USD, when it was priced. */
  cost?: number | null;
  /** The files the turn returned, copied into .data/files/<turnId>/. */
  files?: TurnFile[];
}

export interface StoreData {
  computer?: ComputerRecord;
  session?: SessionRecord;
  turns: TurnRecord[];
}

function key(): Buffer {
  const secret = process.env.STARTER_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("Set STARTER_SECRET in .env.local (openssl rand -base64 32).");
  }
  return createHash("sha256").update(secret).digest();
}

export function seal(plain: string): Sealed {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, body, cipher.getAuthTag()]).toString("base64");
}

export function open(sealed: Sealed): string {
  const raw = Buffer.from(sealed, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(raw.length - 16));
  return Buffer.concat([decipher.update(raw.subarray(12, raw.length - 16)), decipher.final()]).toString("utf8");
}

async function load(): Promise<StoreData> {
  try {
    return JSON.parse(await readFile(FILE, "utf8")) as StoreData;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { turns: [] };
    throw error;
  }
}

// One change at a time, each written whole (to a temporary file, then renamed), so
// a crash never leaves half a record.
let queue: Promise<unknown> = Promise.resolve();

export function read(): Promise<StoreData> {
  return queue.then(load);
}

export function update<T>(change: (data: StoreData) => T): Promise<T> {
  const next = queue.then(async () => {
    const data = await load();
    const result = change(data);
    await mkdir(DATA_DIR, { recursive: true });
    const tmp = `${FILE}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
    await rename(tmp, FILE);
    return result;
  });
  queue = next.catch(() => undefined);
  return next;
}
