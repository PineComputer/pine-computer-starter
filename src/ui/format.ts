export function duration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return s % 60 ? `${m} min ${s % 60} s` : `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

/** Time into the turn, as a column of times reads: 0:42, 12:05. */
export function offset(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function clock(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function cost(usd: number | null | undefined): string | null {
  if (usd === null || usd === undefined) return null;
  return usd > 0 && usd < 0.005 ? "under $0.01" : `$${usd.toFixed(2)}`;
}

export function size(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function kindOf(path: string): string {
  return /\.([a-z0-9]{1,5})$/i.exec(path)?.[1]?.toUpperCase() ?? "FILE";
}
