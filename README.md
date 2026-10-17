# Pine Computer starter

Give your product a computer. This app creates a Pine Computer, hands its agent a job,
shows the work as it happens beside the live screen, lets a person take the controls,
and keeps the answer and files after the Computer stops.

It's a small, complete Next.js app to read and copy from: about a dozen files, built
on the Pine Computer TypeScript SDK,
[`@pinesandbox/computer`](https://www.npmjs.com/package/@pinesandbox/computer), on the
server, and the Web SDK,
[`@pinesandbox/computer-web`](https://www.npmjs.com/package/@pinesandbox/computer-web),
in the browser.

![The starter: the agent's work and answer on the left, the Computer's live screen on the right](docs/screenshot.jpg)

## What it shows

| You see | How it's built | Where |
| --- | --- | --- |
| Create, Stop and Start a Computer | `Credentials` saved before Create; the `Binding` saved after each Start, newest only | [`src/server/pine.ts`](src/server/pine.ts) |
| Give it a job, steer it, answer its question, cancel it | `agent.run` with an idempotency key, `steer`, `answer`, `cancel`, each naming its turn | [`src/app/api/runs`](src/app/api/runs/route.ts), [`src/app/api/turns`](src/app/api/turns/[turnId]/route.ts) |
| The work as it happens, steps grouped by the page they ended on | `agent.events()` relayed as server-sent events; the page resumes from the last event ID | [`src/app/api/events`](src/app/api/events/route.ts), [`src/ui/fold.ts`](src/ui/fold.ts) |
| The live screen, and taking the controls | `delegateDesktop` (a two-minute desktop token) into `<PineDesktop>`; `takeControl` / `releaseControl` | [`src/ui/Desktop.tsx`](src/ui/Desktop.tsx), [`src/app/api/control`](src/app/api/control/route.ts) |
| Answers and files that outlive the Computer | Each finished turn recorded; its files copied in with `readArtifact` | [`src/server/turns.ts`](src/server/turns.ts) |

The project key, the Computer's credentials and the session token stay on the server,
sealed at rest. The browser only ever holds a short-lived desktop token.

## Run it

You need Node.js 22 or later and a Pine Computer project with an API key. Pine Computer
is in private beta: [request access](https://pinecomputer.io).

```sh
git clone https://github.com/PineComputer/pine-computer-starter.git
cd pine-computer-starter
npm install
cp .env.example .env.local   # then add your project's API key and a STARTER_SECRET
npm run dev
```

`STARTER_SECRET` encrypts what the app saves about its Computer; make one with
`openssl rand -base64 32`. Then open <http://localhost:3000>, choose
**Create a Computer**, and give it a job.

## How it fits together

```
Browser                         Your server (this app)                 Pine
───────                         ──────────────────────                 ────
<PineDesktop>  ── desktop token ── POST /api/desktop ── delegateDesktop ──▶ screen
EventSource    ◀── events ──────── GET  /api/events ─── agent.events() ◀── activity
Composer       ── task ──────────▶ POST /api/runs ───── agent.run(key) ──▶ turn
                                   .data/  credentials, binding, session token (sealed),
                                           turns, and the files they returned
```

- **One Computer, one session.** The app keeps a single Computer and works in its
  session `main`. A Computer runs up to three sessions at once.
- **Turns.** A turn starts with your task or your answer and ends when the agent finishes,
  fails, is canceled or asks a question. The page draws each from its events: what you
  asked, the work (folded to what it did and the screens it left), and the answer.
- **History.** Pine keeps a session's turns and events while its runtime runs. Your
  product keeps what people came for: the app records each finished turn and copies its
  files into `.data/files/`, so they're still there after Stop.
- **Resuming.** Every request rebuilds the Computer from its saved records, so a server
  restart, or another server, carries on where the last one stopped.

## Before you ship something like it

This is a single-user example. It has no sign-in: anyone who can reach it can drive the
Computer. In a product:

- **Put every route behind your own sign-in**, and keep one Computer (or more) per user
  or per workspace, with its records in your database instead of `.data/store.json`.
- **Encrypt the records with a key from your secret manager.** The credentials start the
  Computer and decrypt its saved state; the binding and session token drive it.
- **Record turns in a worker**, not only when a page is watching: call `agent.wait` for
  each running turn and sync it when it ends, as `src/server/turns.ts` does.
- **Choose when to Stop.** A runtime stops by itself after its idle timeout (300 s by
  default; set `idleTimeoutSeconds` on Create and Start). Stop saves sign-ins, cookies
  and learned skills; Start restores them into a fresh runtime.
- **Handle the errors you can act on**: `RuntimeRetainedError` (Start found it still
  running), `RunUnconfirmedError` (send the run again with the same key), and
  `isRetryable(error)` for the rest. See the SDK's README.

## Develop

```sh
npm run check   # typecheck and the fold tests
npm run build
```

## Learn more

- [Developer docs](https://pinesandbox.io/docs/integration): Computers, sessions, the agent and the desktop.
- The SDKs on npm: [`@pinesandbox/computer`](https://www.npmjs.com/package/@pinesandbox/computer) and [`@pinesandbox/computer-web`](https://www.npmjs.com/package/@pinesandbox/computer-web).
- [Discord](https://discord.gg/gVawMHNde) for questions.

## License

[Apache-2.0](LICENSE), like the SDKs it's built on.
