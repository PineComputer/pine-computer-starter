// A file a turn returned, from this app's own copy: it stays downloadable after the
// Computer stops.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { failure, HttpError } from "@/server/http";
import { storedFile } from "@/server/turns";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ turnId: string; path: string[] }> }) {
  try {
    const { turnId, path: parts } = await params;
    const relative = parts.join("/");
    let bytes: Buffer;
    try {
      bytes = await readFile(storedFile(turnId, relative));
    } catch {
      throw new HttpError(404, "That file isn't saved yet.");
    }
    const name = path.basename(relative).replace(/"/g, "");
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(path.basename(relative))}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof HttpError) return new Response(error.message, { status: error.status });
    return failure(error);
  }
}
