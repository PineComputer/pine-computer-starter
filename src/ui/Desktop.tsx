"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";

// The viewer draws onto a canvas in the browser; it never renders on the server.
const PineDesktop = dynamic(() => import("@pinesandbox/computer-web/react").then((m) => m.PineDesktop), { ssr: false });

/** A desktop connection from this app's server: the Computer's address and a two-minute token. */
async function delegation() {
  const response = await fetch("/api/desktop", { method: "POST" });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "Couldn't connect to the desktop.");
  // Loaded in the browser only: the package defines browser elements.
  const { connectionFromDelegation } = await import("@pinesandbox/computer-web");
  return connectionFromDelegation(body);
}

/**
 * The session's live screen. Watching sends no input; driving is for a person who
 * took the controls, which makes Pine's agent wait until they hand back.
 */
export function Desktop({ session, driving }: { session: string; driving: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const first = useRef<string | null>(null);

  useEffect(() => {
    let current = true;
    setUrl(null);
    delegation()
      .then((connection) => {
        if (!current) return;
        first.current = connection.token;
        setUrl(connection.url);
      })
      .catch((error: Error) => current && setProblem(error.message));
    return () => {
      current = false;
    };
  }, [session]);

  // Every connect, including an automatic reconnect, asks the server for a fresh token.
  const token = useCallback(async () => {
    const saved = first.current;
    first.current = null;
    return saved ?? (await delegation()).token;
  }, []);

  if (problem) {
    return (
      <div className="screen-msg">
        <h2>The desktop didn’t connect</h2>
        <p>{problem}</p>
      </div>
    );
  }
  if (!url) return <p className="quiet">Connecting the desktop…</p>;
  return (
    <PineDesktop
      className="desktop"
      url={url}
      token={token}
      control={driving ? "drive" : "view"}
      clipboard={driving ? ["local-to-remote", "remote-to-local"] : []}
      onError={({ error }) => setProblem(error instanceof Error ? error.message : "The desktop connection failed.")}
    />
  );
}
