"use client";

import { forwardRef, useState } from "react";

export type ComposerMode = "run" | "steer" | "answer" | "off";

const PLACEHOLDER: Record<ComposerMode, string> = {
  run: "Describe a task",
  steer: "Steer it while it works",
  answer: "Answer Pine Computer",
  off: "Start the Computer to give it a task",
};

/** One box for every reply: a new task, a steer while it works, or an answer it asked for. */
export const Composer = forwardRef<HTMLTextAreaElement, {
  mode: ComposerMode;
  text: string;
  onText: (text: string) => void;
  onSubmit: () => Promise<void>;
  onCancel?: () => Promise<void>;
}>(function Composer({ mode, text, onText, onSubmit, onCancel }, ref) {
  const [busy, setBusy] = useState<"send" | "cancel" | null>(null);
  const act = async (which: "send" | "cancel", run: () => Promise<void>) => {
    setBusy(which);
    try {
      await run();
    } finally {
      setBusy(null);
    }
  };
  const canSend = mode !== "off" && text.trim().length > 0 && busy === null;
  const label = mode === "steer" ? "Steer" : mode === "answer" ? "Answer" : "Send";

  return (
    <form
      className="composer"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSend) void act("send", onSubmit);
      }}
    >
      <label className="sr-only" htmlFor="composer">
        {PLACEHOLDER[mode]}
      </label>
      <textarea
        ref={ref}
        id="composer"
        value={text}
        placeholder={PLACEHOLDER[mode]}
        disabled={mode === "off"}
        onChange={(event) => onText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            if (canSend) void act("send", onSubmit);
          }
        }}
      />
      <div className="composer-bar">
        <span className="hint">{mode === "off" ? "" : "↵ to send"}</span>
        {onCancel && (mode === "steer" || mode === "answer") ? (
          <button type="button" className="btn quiet" aria-busy={busy === "cancel"} disabled={busy !== null} onClick={() => void act("cancel", onCancel)}>
            Cancel
          </button>
        ) : null}
        <button type="submit" className={mode === "steer" ? "btn secondary" : "btn"} aria-busy={busy === "send"} disabled={!canSend}>
          {label}
        </button>
      </div>
    </form>
  );
});
