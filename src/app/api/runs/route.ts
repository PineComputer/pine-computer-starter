// Gives the agent a goal. The page sends the key it made for this message: sending
// the same key again (after a lost response, say) returns the turn it started
// instead of starting a second one.

import { body, failure, HttpError, json, requireSession } from "@/server/http";
import { recordStarted } from "@/server/turns";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { goal, key } = await body<{ goal?: string; key?: string }>(request);
    if (!goal?.trim()) throw new HttpError(400, "Describe a task.");
    if (!key) throw new HttpError(400, "Send the message's key.");
    const session = await requireSession();
    const turn = await session.agent.run(goal.trim(), { idempotencyKey: key });
    await recordStarted(turn, "run", goal.trim(), key);
    return json({ turnId: turn.turnId, state: turn.state });
  } catch (error) {
    return failure(error);
  }
}
