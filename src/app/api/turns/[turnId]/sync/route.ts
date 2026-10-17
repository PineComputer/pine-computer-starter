// Brings one turn's record up to date: once it has ended, its outcome and a copy of
// the files it returned. The page asks when it sees a turn end; a background worker
// could do the same.

import { failure, json, requireSession } from "@/server/http";
import { sync } from "@/server/turns";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ turnId: string }> }) {
  try {
    const { turnId } = await params;
    return json({ turn: (await sync(await requireSession(), turnId)) ?? null });
  } catch (error) {
    return failure(error);
  }
}
