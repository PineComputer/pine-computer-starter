import "server-only";
import { ApiError, PineError, RuntimeRetainedError } from "@pinesandbox/computer";
import type { Session } from "@pinesandbox/computer";
import { session } from "./pine";

export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

/** Answers with JSON that no cache may keep: everything here is about one Computer, now. */
export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** A failure the page can show as is. Pine's errors name the operation and request. */
export function failure(error: unknown): Response {
  if (error instanceof HttpError) return json({ error: error.message }, error.status);
  if (error instanceof RuntimeRetainedError) return json({ error: "The Computer is still running. Stop it first." }, 409);
  if (error instanceof ApiError) return json({ error: error.message, requestId: error.requestId }, error.status >= 500 ? 502 : error.status);
  if (error instanceof PineError) return json({ error: error.message }, 502);
  console.error(error);
  return json({ error: error instanceof Error ? error.message : "Something went wrong." }, 500);
}

export async function requireSession(): Promise<Session> {
  const current = await session();
  if (!current) throw new HttpError(409, "Start the Computer first.");
  return current;
}

export async function body<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new HttpError(400, "Send a JSON body.");
  }
}
