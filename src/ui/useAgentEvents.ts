"use client";

import { useEffect, useState } from "react";
import type { WireEvent } from "@/shared/events";

/**
 * The session's agent events, from this app's server. A dropped stream comes back
 * from the last event it delivered, so nothing is missed; an event seen twice is
 * folded once. A new `session` (after a Start) begins a fresh stream.
 */
export function useAgentEvents(session: string | null) {
  const [events, setEvents] = useState<WireEvent[]>([]);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    setEvents([]);
    setProblem(null);
    if (!session) return;

    let source: EventSource | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let lastId: number | undefined;
    let stopped = false;
    // The first connection replays the session's history at once: draw it in
    // batches, one per frame, instead of once per event.
    let pending: WireEvent[] = [];
    let frame = 0;
    const flush = () => {
      frame = 0;
      const batch = pending;
      pending = [];
      setEvents((previous) => previous.concat(batch));
    };

    const open = () => {
      source = new EventSource(lastId === undefined ? "/api/events" : `/api/events?after=${lastId}`);
      source.onmessage = (message) => {
        const event = JSON.parse(message.data) as WireEvent;
        lastId = event.id;
        pending.push(event);
        frame ||= requestAnimationFrame(flush);
        setProblem(null);
      };
      source.addEventListener("problem", (message) => {
        setProblem((JSON.parse((message as MessageEvent).data) as { error: string }).error);
      });
      // EventSource retries a stream that ended, but gives up on an HTTP error
      // (before the first task, or while the Computer restarts): open it again.
      source.onerror = () => {
        if (stopped || source?.readyState !== EventSource.CLOSED) return;
        retry = setTimeout(open, 3_000);
      };
    };
    open();

    return () => {
      stopped = true;
      source?.close();
      clearTimeout(retry);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [session]);

  return { events, problem };
}
