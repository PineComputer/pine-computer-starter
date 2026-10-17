// Acts on one turn: answer its question, steer it while it runs, or cancel it.
// Each names the turn it acts on, so a reply meant for an earlier turn can't land
// on a later one.

import { body, failure, HttpError, json, requireSession } from "@/server/http";
import { recordAnswered, recordStarted } from "@/server/turns";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ turnId: string }> }) {
  try {
    const { turnId } = await params;
    const { action, text } = await body<{ action: string; text?: string }>(request);
    const agent = (await requireSession()).agent;
    switch (action) {
      case "answer": {
        if (!text?.trim()) throw new HttpError(400, "Write an answer.");
        // The answer opens the next turn, which continues the same goal. The same
        // answer again returns that same turn.
        const opened = await agent.answer(turnId, text.trim());
        await recordAnswered(turnId);
        await recordStarted(opened, "answer", text.trim());
        return json({ turnId: opened.turnId, state: opened.state });
      }
      case "steer":
        if (!text?.trim()) throw new HttpError(400, "Write what to change.");
        return json({ state: (await agent.steer(turnId, text.trim())).state });
      case "cancel":
        return json({ state: (await agent.cancel(turnId)).state });
      default:
        throw new HttpError(400, "Choose answer, steer or cancel.");
    }
  } catch (error) {
    return failure(error);
  }
}
