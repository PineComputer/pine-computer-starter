// A file a turn returned, from this app's own copy: it stays downloadable after the
// Computer stops.

import { readFile } from "node:fs/promises";
import { HttpError, route } from "@/server/http";
import { download } from "@/server/download";
import { storedFile } from "@/server/turns";
import { currentUser } from "@/server/user";

export const dynamic = "force-dynamic";

export const GET = route<{ turnId: string; path: string[] }>(async (_request, { turnId, path }) => {
  // Next decodes each segment already.
  const relative = path.join("/");
  try {
    return download(relative, await readFile(storedFile(await currentUser(), turnId, relative)));
  } catch {
    throw new HttpError(404, "That file isn't saved yet.");
  }
});
