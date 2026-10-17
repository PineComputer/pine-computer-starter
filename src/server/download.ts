import path from "node:path";

/** Bytes as a download: always an attachment, so a returned page can't run as this app. */
export function download(name: string, bytes: Uint8Array, contentType = "application/octet-stream"): Response {
  const base = path.basename(name);
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${base.replace(/["\\]/g, "")}"; filename*=UTF-8''${encodeURIComponent(base)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    },
  });
}
