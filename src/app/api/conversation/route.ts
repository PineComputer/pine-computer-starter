// Starts a new conversation: the session's agent forgets the last one. Its turns
// stay in this app's history.

import { failure, json, requireSession } from "@/server/http";

export const dynamic = "force-dynamic";

export async function DELETE() {
  try {
    const agent = (await requireSession()).agent;
    const { taskId } = await agent.status();
    const task = await agent.reset(taskId);
    return json({ taskId: task.taskId });
  } catch (error) {
    return failure(error);
  }
}
