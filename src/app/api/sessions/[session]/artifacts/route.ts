// Everything the session's turns returned (or one turn's, with ?turn=), as a zip.

import { route } from "@/server/http";
import { requireSession } from "@/server/pine";
import { currentUser } from "@/server/user";
import { download } from "@/server/download";

export const dynamic = "force-dynamic";

export const GET = route<{ session: string }>(async (request, { session }) => {
  const turnId = new URL(request.url).searchParams.get("turn") || undefined;
  const zip = await (await requireSession(await currentUser(), session)).zipArtifacts({ turnId });
  return download(`${session}${turnId ? `-${turnId}` : ""}-files.zip`, zip, "application/zip");
});
