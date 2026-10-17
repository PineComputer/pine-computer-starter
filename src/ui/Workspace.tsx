"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Composer, type ComposerMode } from "./Composer";
import { Desktop } from "./Desktop";
import { fold } from "./fold";
import { Thread, type SavedTurn } from "./Thread";
import { useAgentEvents } from "./useAgentEvents";

interface AppState {
  computer: { id: string | null; state: string };
  session: { name: string; revision: string } | null;
  turns: SavedTurn[];
}

// Jobs that take a whole computer: reading across sites, working in the shell, and
// leaving a file behind. Each fills the box, to change or send.
const TRIES = [
  {
    title: "Chart a company's results",
    detail: "SEC filings → chart and summary",
    task: "Find Apple's last three annual reports (10-K) on SEC EDGAR, pull net sales and net income for each year, chart them, and save the chart with a short summary in the work directory.",
  },
  {
    title: "Compare pricing pages",
    detail: "Three sites → a spreadsheet",
    task: "Compare the pricing pages of Vercel, Netlify and Cloudflare Pages: each plan, its monthly price and what it includes. Save it as a spreadsheet in the work directory and tell me which is cheapest for a team of five.",
  },
  {
    title: "Brief a team on Hacker News",
    detail: "Today's top stories → a short deck",
    task: "Read today's top ten Hacker News stories and the pages they link to, then make a five-slide deck on the three that matter most to a software team, with a link on each slide. Save it in the work directory.",
  },
];

async function call<T = Record<string, unknown>>(path: string, body?: unknown, method = body === undefined ? "GET" : "POST"): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const answer = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(answer.error ?? `The request failed (${response.status}).`);
  return answer as T;
}

const STATE_WORDS: Record<string, string> = {
  none: "No Computer yet",
  running: "Running",
  stopped: "Stopped",
  paused: "Paused",
};

export function Workspace() {
  const [app, setApp] = useState<AppState | null>(null);
  const [busy, setBusy] = useState<"create" | "start" | "stop" | "control" | "reset" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [driving, setDriving] = useState(false);
  const [peek, setPeek] = useState<{ src: string; title: string } | null>(null);
  const [epoch, setEpoch] = useState(0);
  // The key of the message being sent: a retry after a lost response sends the
  // same key, and Pine returns the turn it already started.
  const messageKey = useRef<string | null>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const synced = useRef(new Set<string>());

  const refresh = useCallback(async () => {
    try {
      setApp(await call<AppState>("/api/computer"));
    } catch (error) {
      setProblem((error as Error).message);
    }
  }, []);

  useEffect(() => {
    void refresh();
    // The Computer can stop on its own when idle: look again now and then.
    const timer = setInterval(() => void refresh(), 30_000);
    return () => clearInterval(timer);
  }, [refresh]);

  const state = app?.computer.state ?? "loading";
  const running = state === "running";
  const session = running && app?.session ? `${app.session.revision}:${epoch}` : null;
  const { events, problem: streamProblem } = useAgentEvents(session);
  const turns = useMemo(() => fold(events), [events]);
  const last = turns[turns.length - 1];

  // Who drives, as the Computer last said.
  useEffect(() => {
    const change = [...events].reverse().find((event) => event.controller);
    if (change) setDriving(change.controller === "human");
  }, [events]);

  // A finished turn's answer and files are kept by this app's server.
  useEffect(() => {
    for (const turn of turns) {
      if (!turn.outcome || synced.current.has(turn.id)) continue;
      synced.current.add(turn.id);
      void call(`/api/turns/${turn.id}/sync`, {}).then(refresh, () => synced.current.delete(turn.id));
    }
  }, [turns, refresh]);

  // Follow the work as it arrives, from the latest turn, unless you've scrolled up to read.
  const pinned = useRef(true);
  useEffect(() => {
    const el = log.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [events.length, app?.turns.length]);

  const lifecycle = async (action: "create" | "start" | "stop") => {
    setBusy(action);
    setProblem(null);
    try {
      await call("/api/computer", { action });
      setDriving(false);
      await refresh();
    } catch (error) {
      setProblem((error as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const mode: ComposerMode = !session
    ? "off"
    : last && !last.outcome
      ? "steer"
      : last?.outcome?.reason === "needs_input"
        ? "answer"
        : "run";

  const submit = async () => {
    setProblem(null);
    try {
      if (mode === "run") {
        messageKey.current ??= crypto.randomUUID();
        await call("/api/runs", { goal: text, key: messageKey.current });
      } else {
        await call(`/api/turns/${last!.id}`, { action: mode, text });
      }
      messageKey.current = null;
      setText("");
      await refresh();
    } catch (error) {
      setProblem((error as Error).message);
    }
  };

  const cancel = async () => {
    try {
      await call(`/api/turns/${last!.id}`, { action: "cancel" });
    } catch (error) {
      setProblem((error as Error).message);
    }
  };

  const control = async (action: "take" | "release") => {
    setBusy("control");
    try {
      const { controller } = await call<{ controller: string }>("/api/control", { action });
      setDriving(controller === "human");
    } catch (error) {
      setProblem((error as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const reset = async () => {
    setBusy("reset");
    try {
      await call("/api/conversation", undefined, "DELETE");
      // The new conversation is a new task: follow it from its start.
      setEpoch((n) => n + 1);
      await refresh();
    } catch (error) {
      setProblem((error as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const agentWorking = Boolean(session && last && !last.outcome);
  const empty = turns.length === 0 && (app?.turns.length ?? 0) === 0;

  return (
    <div className="app">
      <header className="bar">
        <a className="brand" href="/">
          <Mark />
          Pine Computer <small>starter</small>
        </a>
        <div className="bar-end">
          {app?.computer.id ? <span className="computer-id" title={app.computer.id}>{app.computer.id.slice(0, 8)}</span> : null}
          {app ? (
            <span className="status" data-state={busy === "start" || busy === "create" || busy === "stop" ? "busy" : running ? "running" : undefined}>
              {busy === "start" ? "Starting" : busy === "create" ? "Creating" : busy === "stop" ? "Stopping" : (STATE_WORDS[state] ?? state)}
            </span>
          ) : null}
          {/* While an action runs, its button stays: the state can read "stopped"
              while a new Computer is still being created. */}
          {busy === "create" || (!busy && state === "none") ? (
            <button className="btn" aria-busy={busy === "create"} disabled={busy !== null} onClick={() => void lifecycle("create")}>
              Create a Computer
            </button>
          ) : busy === "start" || (!busy && state === "stopped") ? (
            <button className="btn" aria-busy={busy === "start"} disabled={busy !== null} onClick={() => void lifecycle("start")}>
              Start
            </button>
          ) : busy === "stop" || running ? (
            <button className="btn secondary" aria-busy={busy === "stop"} disabled={busy !== null} onClick={() => void lifecycle("stop")}>
              Stop
            </button>
          ) : null}
        </div>
      </header>

      <main className="main">
        <section className="thread" aria-label="Conversation">
          <div className="thread-head">
            <span className="title">Conversation</span>
            {session && turns.length > 0 && !agentWorking ? (
              <button className="btn quiet" aria-busy={busy === "reset"} disabled={busy !== null} onClick={() => void reset()}>
                New conversation
              </button>
            ) : null}
          </div>
          <div
            className="log"
            ref={log}
            role="log"
            aria-label="Pine Computer's work and answers"
            onScroll={(event) => {
              const el = event.currentTarget;
              pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
            }}
          >
            {empty ? (
              <div className="empty">
                <h2>{state === "none" ? "Give your product a computer" : "Give it a job"}</h2>
                <p>
                  {state === "none"
                    ? "Create a Computer, hand it a task, and watch Pine's agent work across the web, files and a shell. Take the controls any time."
                    : "Describe a task below, or start from one of these. The steps appear here as it works, and the screen shows it live."}
                </p>
                {state !== "none" ? (
                  <ul className="tries" aria-label="Examples">
                    {TRIES.map((item) => (
                      <li key={item.title}>
                        <button
                          type="button"
                          disabled={mode === "off"}
                          onClick={() => {
                            setText(item.task);
                            messageKey.current = null;
                            composer.current?.focus();
                          }}
                        >
                          <b>{item.title}</b>
                          <span>{item.detail}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : (
              <Thread turns={turns} saved={app?.turns ?? []} running={agentWorking} onPeek={(src, title) => setPeek({ src, title })} />
            )}
          </div>
          {problem || streamProblem ? (
            <p className="problem" role="alert">
              {problem ?? streamProblem}
            </p>
          ) : null}
          <Composer
            ref={composer}
            mode={mode}
            text={text}
            onText={(next) => {
              setText(next);
              messageKey.current = null; // edited text is a new message
            }}
            onSubmit={submit}
            onCancel={cancel}
          />
        </section>

        <section className="stage" aria-label="The Computer's screen">
          <div className="stage-bar">
            {driving ? (
              <span className="status" data-state="you">You’re driving</span>
            ) : agentWorking ? (
              <span className="status" data-state="agent">Pine Computer is driving</span>
            ) : (
              <span className="status">{session ? "You’re watching" : "Not connected"}</span>
            )}
            {session ? (
              <button className={driving ? "btn" : "btn secondary"} aria-busy={busy === "control"} disabled={busy !== null} onClick={() => void control(driving ? "release" : "take")}>
                {driving ? "Hand back" : "Take the controls"}
              </button>
            ) : null}
          </div>
          <div className="screen" data-driver={driving ? "you" : undefined}>
            {session && app?.session ? (
              <Desktop session={app.session.revision} driving={driving} />
            ) : (
              <div className="screen-msg">
                <h2>{state === "none" ? "No Computer yet" : state === "loading" ? "Loading" : "The Computer is stopped"}</h2>
                <p>
                  {state === "stopped"
                    ? "Start restores its saved browser state, sign-ins included, into a fresh runtime. Your earlier answers and files are kept on the left."
                    : state === "none"
                      ? "Its screen appears here once it runs."
                      : ""}
                </p>
              </div>
            )}
            {peek ? (
              <div className="peek" role="dialog" aria-label={`The screen after ${peek.title}`}>
                {/* eslint-disable-next-line @next/next/no-img-element -- a data URL from the stream */}
                <img src={peek.src} alt={`The screen after ${peek.title}`} />
                <button className="btn" onClick={() => setPeek(null)}>
                  Back to live
                </button>
              </div>
            ) : null}
          </div>
        </section>
      </main>
    </div>
  );
}

function Mark() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
      <path d="M1 7V1h6M15 1h6v6M21 15v6h-6M7 21H1v-6" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="8" y="8" width="6" height="6" fill="var(--mint)" />
    </svg>
  );
}
