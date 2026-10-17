// The agent's public activity, relayed to the page as server-sent events. The page's
// EventSource reconnects by itself with Last-Event-ID, and the SDK resumes the
// Computer's stream from it, so nothing is missed or shown twice across a dropped
// connection. Without one, the stream replays the session's retained history first.

import { ApiError } from "@pinesandbox/computer";
import { session } from "@/server/pine";
import { failure, HttpError } from "@/server/http";
import { toWire } from "@/server/wire";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const current = await session();
    if (!current) throw new HttpError(409, "Start the Computer first.");
    let taskId: string;
    try {
      ({ taskId } = await current.agent.status());
    } catch (error) {
      // No task until the first run: tell the page to look again shortly.
      if (error instanceof ApiError && error.status === 404) {
        return new Response("retry: 3000\n\n", { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store" } });
      }
      throw error;
    }
    // EventSource sends Last-Event-ID when it reconnects; a page that opens a new
    // stream says where it got to with ?after=.
    const lastEventId = request.headers.get("last-event-id") ?? new URL(request.url).searchParams.get("after") ?? undefined;
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (text: string) => controller.enqueue(encoder.encode(text));
        // A comment now and then keeps proxies from closing a quiet stream.
        const keepalive = setInterval(() => send(": keepalive\n\n"), 15_000);
        try {
          send("retry: 2000\n\n");
          for await (const event of current.agent.events({ lastEventId, expectedTaskId: taskId, signal: request.signal })) {
            const wire = toWire(event);
            if (wire) send(`id: ${event.eventId}\ndata: ${JSON.stringify(wire)}\n\n`);
          }
        } catch (error) {
          if (!request.signal.aborted) {
            send(`event: problem\ndata: ${JSON.stringify({ error: error instanceof Error ? error.message : "The stream stopped." })}\n\n`);
          }
        } finally {
          clearInterval(keepalive);
          try {
            controller.close();
          } catch {
            // the page already went away
          }
        }
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" },
    });
  } catch (error) {
    return failure(error);
  }
}
