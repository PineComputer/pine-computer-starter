// The Computer: its state and the turns this app kept (GET), and its lifecycle
// (POST create, start or stop).

import { create, start, state, stop } from "@/server/pine";
import { body, failure, HttpError, json } from "@/server/http";
import { read } from "@/server/store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [computer, data] = await Promise.all([state(), read()]);
    // The session's revision tells the page when a Start replaced it with a new one.
    const session = data.session ? { name: data.session.name, revision: data.session.bindingRevision } : null;
    return json({ computer, session, turns: data.turns });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const { action } = await body<{ action: string }>(request);
    switch (action) {
      case "create":
        await create();
        break;
      case "start":
        await start();
        break;
      case "stop":
        if (!(await stop())) throw new HttpError(502, "The Computer didn't confirm it stopped. Try again.");
        break;
      default:
        throw new HttpError(400, "Choose create, start or stop.");
    }
    return json({ computer: await state() });
  } catch (error) {
    return failure(error);
  }
}
