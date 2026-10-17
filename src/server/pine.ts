// The Computer, as the server SDK sees it: rebuilt from the saved records on every
// request, so any server process (or a restart) picks up where the last one left
// off. Nothing here is cached but the Client.

import "server-only";
import { Binding, Client, Credentials, NotFoundError, type Computer, type Session } from "@pinesandbox/computer";
import { open, read, seal, update } from "./store";

/** This app works in one session; a Computer runs up to three at once. */
export const SESSION = "main";

let shared: Client | undefined;

/** Reads PINE_SANDBOX_ENDPOINT and PINE_SANDBOX_API_KEY. */
export function client(): Client {
  shared ??= Client.fromEnv();
  return shared;
}

/** The saved Computer, ready to call, or null before one is created or while it has no runtime. */
export async function computer(): Promise<Computer | null> {
  const { computer: saved } = await read();
  if (!saved?.binding) return null;
  return client().reconnectComputer(Credentials.parse(open(saved.credentials)), Binding.parse(open(saved.binding)));
}

/** The session this app works in, or null when the current runtime has none yet. */
export async function session(): Promise<Session | null> {
  const [handle, { session: saved }] = await Promise.all([computer(), read()]);
  if (!handle || !saved || saved.bindingRevision !== handle.bindingRevision.toString()) return null;
  return handle.adoptSession(saved.name, open(saved.token));
}

export type ComputerState = "none" | "stopped" | string;

/** The runtime's state: running, paused, resuming…, or stopped when it has none. */
export async function state(): Promise<{ id: string | null; state: ComputerState }> {
  const { computer: saved } = await read();
  if (!saved) return { id: null, state: "none" };
  const handle = await computer();
  if (!handle) return { id: saved.id, state: "stopped" };
  try {
    return { id: saved.id, state: await handle.status() };
  } catch (error) {
    // The runtime record is gone: it stopped (idle, or from elsewhere). Start restores it.
    if (error instanceof NotFoundError) return { id: saved.id, state: "stopped" };
    throw error;
  }
}

/** Creates this app's Computer and opens its session. */
export async function create(): Promise<void> {
  if ((await read()).computer) throw new Error("This app already has a Computer.");
  const credentials = await Credentials.generate();
  // Saved before Create: they are the only way to start this Computer again, even if
  // Create fails after registering it.
  await update((data) => {
    data.computer = { id: credentials.id, credentials: seal(credentials.serialize()), binding: "", bindingRevision: "0" };
    delete data.session;
  });
  const created = await client().createComputer({ credentials });
  await saveBinding(created);
  await openSession(created);
}

/** Starts the stopped Computer from its saved state and opens a fresh session. */
export async function start(): Promise<void> {
  const { computer: saved } = await read();
  if (!saved) throw new Error("Create a Computer first.");
  const started = await client().startComputer(Credentials.parse(open(saved.credentials)));
  await saveBinding(started);
  await openSession(started);
}

/** Saves what the Computer can keep, then releases its runtime and sessions. */
export async function stop(): Promise<boolean> {
  const handle = await computer();
  if (!handle) return true;
  const stopped = await handle.stop();
  await update((data) => {
    delete data.session;
  });
  return stopped;
}

// A binding is saved only over an older one, so a slow reply from one Start can
// never overwrite the binding of a later one.
async function saveBinding(handle: Computer): Promise<void> {
  const revision = handle.bindingRevision;
  await update((data) => {
    const saved = data.computer;
    if (!saved || saved.id !== handle.id) throw new Error("The saved Computer changed while it started.");
    if (saved.binding && BigInt(saved.bindingRevision) >= revision) return;
    saved.binding = seal(handle.binding().serialize());
    saved.bindingRevision = revision.toString();
  });
}

async function openSession(handle: Computer): Promise<void> {
  const opened = await handle.createSession({ name: SESSION, browser: true });
  // The session token is returned only here. Keep it to drive the session later.
  await update((data) => {
    data.session = { name: SESSION, token: seal(opened.token), bindingRevision: handle.bindingRevision.toString() };
  });
}
