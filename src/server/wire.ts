import "server-only";
import type { AgentActivity, AgentEvent } from "@pinesandbox/computer";
import type { Step, WireEvent } from "@/shared/events";

const step = (activity: AgentActivity): Step => ({
  id: activity.id,
  state: activity.state,
  kind: activity.kind,
  title: activity.title,
  ...(activity.facts
    ? { facts: { page: activity.facts.page, steps: activity.facts.steps, files: activity.facts.files } }
    : {}),
});

/** The SDK's event, as the page needs it; null for types the page doesn't draw. */
export function toWire(event: AgentEvent): WireEvent | null {
  const base = { id: event.eventId, turnId: event.turnId, at: event.ts?.getTime() ?? Date.now(), type: event.type };
  switch (event.type) {
    case "input": {
      const input = event.input();
      return input ? { ...base, input: { kind: input.kind, text: input.text } } : null;
    }
    case "progress": {
      const progress = event.progress();
      return progress ? { ...base, progress } : null;
    }
    case "activity": {
      const activity = event.activity();
      return activity ? { ...base, step: step(activity) } : null;
    }
    case "frame": {
      const frame = event.frame();
      if (!frame) return null;
      const src = `data:${frame.mediaType};base64,${Buffer.from(frame.data).toString("base64")}`;
      return { ...base, frame: { src, stepId: frame.activity?.id } };
    }
    case "controller_changed":
      return { ...base, controller: event.controller };
    case "result": {
      const result = event.result();
      if (!result) return null;
      return {
        ...base,
        outcome: {
          reason: result.terminalReason,
          summary: result.summary,
          files: result.artifacts.map((file) => ({ path: file.relativePath, size: file.size })),
          durationMs: result.usage.duration.totalMs,
          cost: result.usage.cost.total,
        },
      };
    }
    default:
      return null;
  }
}
