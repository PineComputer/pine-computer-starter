// A connection the page can open to watch, or drive, the session's desktop. It holds
// a desktop token that expires in two minutes and never the project key, the
// Computer's credentials or the session token. The page asks again on every connect.

import { computer, SESSION } from "@/server/pine";
import { failure, HttpError, json } from "@/server/http";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const handle = await computer();
    if (!handle) throw new HttpError(409, "Start the Computer first.");
    return json(await handle.delegateDesktop(SESSION));
  } catch (error) {
    return failure(error);
  }
}
