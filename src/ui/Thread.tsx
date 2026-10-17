"use client";

import type { Turn } from "./fold";
import { film, pieces, rows, tally, type Item, type Row } from "./fold";
import { clock, cost, duration, kindOf, offset, size } from "./format";
import { Markdown } from "./Markdown";

/** A turn as this app's server kept it: it outlives the Computer's session. */
export interface SavedTurn {
  turnId: string;
  kind: "run" | "answer";
  ask: string;
  askedAt: string;
  state: string;
  summary?: string;
  endedAt?: string;
  durationMs?: number;
  cost?: number | null;
  files?: { path: string; size: number; contentType: string }[];
}

type Peek = (src: string, title: string) => void;

const FILM = 5;

export function Thread({ turns, saved, running, onPeek }: { turns: Turn[]; saved: SavedTurn[]; running: boolean; onPeek: Peek }) {
  const live = new Set(turns.map((turn) => turn.id));
  // Turns from an earlier session (before a Stop) are only in this app's records.
  const earlier = saved.filter((record) => !live.has(record.turnId));
  const byId = new Map(saved.map((record) => [record.turnId, record]));
  const last = turns[turns.length - 1];
  return (
    <>
      {earlier.length ? (
        <p className="earlier">Earlier sessions: the answers and files this app kept. Their steps stayed with the sessions.</p>
      ) : null}
      {earlier.map((record) => (
        <TurnView key={record.turnId} saved={record} live={false} onPeek={onPeek} />
      ))}
      {earlier.length && turns.length ? <hr className="session-rule" aria-label="This session" /> : null}
      {turns.map((turn) => (
        <TurnView key={turn.id} turn={turn} saved={byId.get(turn.id)} live={running && turn === last && !turn.outcome} onPeek={onPeek} />
      ))}
    </>
  );
}

function TurnView({ turn, saved, live, onPeek }: { turn?: Turn; saved?: SavedTurn; live: boolean; onPeek: Peek }) {
  const turnId = turn?.id ?? saved!.turnId;
  const ask = turn?.ask ?? (saved?.ask ? { kind: saved.kind, text: saved.ask, at: Date.parse(saved.askedAt) } : undefined);
  const startedAt = turn?.startedAt ?? Date.parse(saved!.askedAt);
  const fileUrl = (path: string) =>
    saved?.files?.some((file) => file.path === path) ? `/api/files/${encodeURIComponent(turnId)}/${path.split("/").map(encodeURIComponent).join("/")}` : null;

  return (
    <>
      {ask ? (
        <article className="msg you">
          <header className="who">
            You{ask.kind === "answer" ? <span className="quiet">answered</span> : null}
            <time>{clock(ask.at)}</time>
          </header>
          <p className="words">{ask.text}</p>
        </article>
      ) : null}
      {turn ? (
        pieces(turn).map((piece) =>
          piece.kind === "work" ? (
            <Work key={piece.items[0].id} items={piece.items} since={piece.since} startedAt={startedAt} live={live} onPeek={onPeek} />
          ) : piece.kind === "steer" ? (
            <article key={piece.item.id} className="msg you">
              <header className="who">
                You<span className="quiet">while it worked</span>
                <time>{clock(piece.item.at)}</time>
              </header>
              <p className="words">{piece.item.text}</p>
            </article>
          ) : (
            <div key={piece.item.id} className="note-alone">
              <Markdown text={piece.item.text} fileUrl={fileUrl} />
            </div>
          ),
        )
      ) : null}
      {live && !turn?.items.length ? (
        <p className="runline">
          <span className="status" data-state="agent">Working</span>
        </p>
      ) : null}
      <Outcome turn={turn} saved={saved} fileUrl={fileUrl} />
    </>
  );
}

function Work({ items, since, startedAt, live, onPeek }: { items: Item[]; since: number; startedAt: number; live: boolean; onPeek: Peek }) {
  const list = rows(items);
  const said = tally(list);
  const shots = film(list);
  const end = Math.max(...items.map((item) => (item.kind === "step" && item.endedAt) || item.at));
  return (
    <div className="work-block" style={{ display: "grid", gap: 8 }}>
      <details className="work" open={live || undefined}>
        <summary>
          {live ? <span className="live">Working</span> : <span>Worked for {duration(end - since)}</span>}
          {said ? <span className="n">{said}</span> : null}
        </summary>
        <ol className="steps">
          {list.map((row) => (
            <RowView key={rowKey(row)} row={row} startedAt={startedAt} live={live} onPeek={onPeek} />
          ))}
        </ol>
      </details>
      {shots.length ? (
        <div className="film" role="group" aria-label="Screens from this work">
          {shots.slice(0, shots.length > FILM ? FILM - 1 : FILM).map(({ frame, title }) => (
            <Thumb key={frame.id} src={frame.src} title={title} onPeek={onPeek} />
          ))}
          {shots.length > FILM ? <span className="thumb more mono">+{shots.length - FILM + 1}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

const rowKey = (row: Row) => (row.kind === "visit" ? row.stepIds[0] : row.item.id);

const OUTCOME_WORDS: Record<string, string> = { failed: "Failed", declined: "Not run", interrupted: "Interrupted" };

function RowView({ row, startedAt, live, onPeek }: { row: Row; startedAt: number; live: boolean; onPeek: Peek }) {
  if (row.kind === "note") {
    return (
      <li data-kind="note">
        <Markdown text={row.item.text} />
        <time>{offset(row.item.at - startedAt)}</time>
      </li>
    );
  }
  if (row.kind === "control") {
    return (
      <li data-kind="control">
        <span>{row.item.text}</span>
        <time>{offset(row.item.at - startedAt)}</time>
      </li>
    );
  }
  if (row.kind === "visit") {
    // A step still running when its turn ended has no outcome to show.
    const state = row.state === "running" && !live ? "interrupted" : row.state;
    return (
      <li data-state={state}>
        <div>
          {row.continued ? null : (
            <>
              {row.url ? (
                <a className="visit-title" href={row.url} target="_blank" rel="noopener noreferrer">
                  {row.title}
                </a>
              ) : (
                <span className="visit-title">{row.title}</span>
              )}
              {row.site ? <span className="visit-site">{row.site}</span> : null}
            </>
          )}
          <ul className="actions" aria-label={`What it did on ${row.title}`}>
            {row.actions.map((action, i) => (
              <li key={i} data-state={action.state}>
                {action.text}
                {action.times > 1 ? <span className="times">×{action.times}</span> : null}
                {OUTCOME_WORDS[action.state] ? <span className="outcome">{OUTCOME_WORDS[action.state]}</span> : null}
              </li>
            ))}
          </ul>
        </div>
        <div className="side">
          <time>{offset(row.at - startedAt)}</time>
          {row.frame ? <Thumb src={row.frame.src} title={row.title} onPeek={onPeek} /> : null}
        </div>
      </li>
    );
  }
  const { step, frames, at } = row.item;
  const state = step.state === "running" && !live ? "interrupted" : step.state;
  const frame = frames[frames.length - 1];
  return (
    <li data-state={state}>
      <span>
        {step.title}
        {OUTCOME_WORDS[state] ? <span className="quiet"> · {OUTCOME_WORDS[state]}</span> : null}
      </span>
      <div className="side">
        <time>{offset(at - startedAt)}</time>
        {frame ? <Thumb src={frame.src} title={step.title} onPeek={onPeek} /> : null}
      </div>
    </li>
  );
}

function Thumb({ src, title, onPeek }: { src: string; title: string; onPeek: Peek }) {
  return (
    <button type="button" className="thumb" aria-label={`Show the screen after ${title}`} onClick={() => onPeek(src, title)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- a data URL from the stream */}
      <img src={src} alt="" />
    </button>
  );
}

function Outcome({ turn, saved, fileUrl }: { turn?: Turn; saved?: SavedTurn; fileUrl: (path: string) => string | null }) {
  const reason = turn?.outcome?.reason ?? (saved && saved.state !== "running" ? saved.state : undefined);
  if (!reason) return null;
  const summary = turn?.outcome?.summary ?? saved?.summary ?? "";
  const at = turn?.outcome?.at ?? (saved?.endedAt ? Date.parse(saved.endedAt) : Date.now());
  const ms = turn?.outcome?.durationMs ?? saved?.durationMs ?? 0;
  const price = cost(turn?.outcome?.cost ?? saved?.cost);
  const returned = turn?.outcome?.files ?? saved?.files ?? [];

  if (reason === "needs_input" || reason === "answered") {
    return (
      <article className="msg question">
        <header className="who">
          <span className="status" data-state="you">{reason === "answered" ? "Asked" : "Needs your answer"}</span>
          <time>{clock(at)}</time>
        </header>
        <Markdown text={summary} fileUrl={fileUrl} />
      </article>
    );
  }

  const completed = reason === "completed";
  const word = completed ? "Completed" : reason.startsWith("cancel") ? "Canceled" : "Stopped";
  return (
    <article className={completed && summary ? "msg answer" : "msg"}>
      {summary ? (
        <>
          <header className="who">
            {completed ? "Pine Computer" : "Outcome"}
            <time>{clock(at)}</time>
          </header>
          <Markdown text={summary} fileUrl={fileUrl} />
        </>
      ) : null}
      {returned.length ? (
        <ul className="files" aria-label="Files it returned">
          {returned.map((file) => {
            const url = fileUrl(file.path);
            const slash = file.path.lastIndexOf("/");
            const body = (
              <>
                <span className="kind">{kindOf(file.path)}</span>
                <span className="path">
                  {slash > 0 ? <span className="folder">{file.path.slice(0, slash + 1)}</span> : null}
                  <span className="name">{file.path.slice(slash + 1)}</span>
                </span>
                <span className="size">{url ? size(file.size) : "Saving…"}</span>
              </>
            );
            return <li key={file.path}>{url ? <a href={url}>{body}</a> : <span className="file">{body}</span>}</li>;
          })}
        </ul>
      ) : null}
      <p className="runline">
        <span className="status" data-state={completed ? "done" : word === "Stopped" ? "failed" : undefined}>{word}</span>
        <span>{[duration(ms), price].filter(Boolean).join(" · ")}</span>
      </p>
    </article>
  );
}
