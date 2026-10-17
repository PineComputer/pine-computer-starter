// The agent's turns, as this app keeps them. Pine retains a session's turns and
// events while its runtime lives; the answer and files a person came for belong in
// your product, so each finished turn is recorded here and its files copied in.

import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AgentTurn, Session } from "@pinesandbox/computer";
import { DATA_DIR, read, update, type TurnFile, type TurnRecord } from "./store";

const FILES_DIR = path.join(DATA_DIR, "files");

/** Where a returned file is kept, refusing any path that would leave the turn's folder. */
export function storedFile(turnId: string, relativePath: string): string {
  const folder = path.join(FILES_DIR, path.basename(turnId));
  const file = path.resolve(folder, relativePath);
  if (!file.startsWith(folder + path.sep)) throw new Error("That file isn't in the turn's folder.");
  return file;
}

/** Records a turn the moment it is admitted: a run with the key that admitted it, or an answer. */
export async function recordStarted(turn: AgentTurn, kind: "run" | "answer", ask: string, runKey = ""): Promise<void> {
  await update((data) => {
    if (data.turns.some((t) => t.turnId === turn.turnId)) return;
    data.turns.push({ turnId: turn.turnId, kind, runKey, ask, askedAt: new Date().toISOString(), state: turn.state });
  });
}

/** A question, once answered, is history: the answer's turn carries on. */
export async function recordAnswered(turnId: string): Promise<void> {
  await update((data) => {
    const asked = data.turns.find((t) => t.turnId === turnId);
    if (asked) asked.state = "answered";
  });
}

const ENDED = new Set(["needs_input", "answered", "completed", "failed", "canceled"]);

/**
 * Brings a turn's record up to date: when it has ended, its outcome, and the files it
 * returned, copied in. Safe to call any number of times, from any worker.
 */
export async function sync(session: Session, turnId: string): Promise<TurnRecord | undefined> {
  const recorded = (await read()).turns.find((t) => t.turnId === turnId);
  if (recorded?.files) return recorded; // already complete
  // wait() returns as soon as the turn ends (at once if it has), and never cancels it.
  // The page asks when it sees the result, which can arrive a moment before the turn
  // reads as ended.
  const turn = await session.agent.wait(turnId, { timeoutMs: 10_000 });
  if (!ENDED.has(turn.state) || !turn.result) return recorded;

  // The result names each file by its path in the working directory, which is how
  // the answer links it. The turn saved a copy of each as an artifact; read that
  // copy (same name and hash), or the file as it is now if there is none.
  const result = turn.result;
  const copies = await session.listArtifacts({ turnId });
  const files: TurnFile[] = [];
  for (const ref of result.artifacts) {
    const copy = copies.find((a) => a.sha256 === ref.sha256 && a.filename === path.basename(ref.relativePath));
    const bytes = copy ? await session.readArtifact(copy.id) : await session.readFile(ref.relativePath);
    const target = storedFile(turnId, ref.relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, bytes);
    files.push({ path: ref.relativePath, size: bytes.byteLength, contentType: copy?.contentType ?? ref.contentType });
  }

  return update((data) => {
    let record = data.turns.find((t) => t.turnId === turnId);
    if (!record) {
      // A turn this app didn't start (another worker, or an answer): keep it too.
      record = { turnId, kind: "run", runKey: "", ask: "", askedAt: (turn.startedAt ?? new Date()).toISOString(), state: turn.state };
      data.turns.push(record);
    }
    Object.assign(record, {
      // An answer recorded meanwhile stays: the turn reads needs_input until then.
      state: record.state === "answered" ? "answered" : turn.state,
      summary: result.summary,
      endedAt: (turn.endedAt ?? new Date()).toISOString(),
      durationMs: result.usage.duration.totalMs,
      cost: result.usage.cost.total,
      files,
    });
    return record;
  });
}
