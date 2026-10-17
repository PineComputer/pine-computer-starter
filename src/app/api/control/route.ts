// Who drives the session. Taking the controls makes Pine's agent wait while a person
// uses the desktop; handing back lets it carry on where it was.

import { computer, SESSION } from "@/server/pine";
import { body, failure, HttpError, json } from "@/server/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { action } = await body<{ action: string }>(request);
    const handle = await computer();
    if (!handle) throw new HttpError(409, "Start the Computer first.");
    if (action !== "take" && action !== "release") throw new HttpError(400, "Choose take or release.");
    const state = action === "take" ? await handle.takeControl(SESSION) : await handle.releaseControl(SESSION);
    return json({ controller: state.controller });
  } catch (error) {
    return failure(error);
  }
}
