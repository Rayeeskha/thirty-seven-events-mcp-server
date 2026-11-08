# Thirty Seven Events — MCP Server

An **MCP (Model Context Protocol) server** for **Thirty Seven (37 Events)**, an events management and marketing company in Saudi Arabia. It lets an AI assistant such as **Claude** work with the company's event data stored in **MySQL**:

- search events by date, client and status, and read the full details of one event;
- add an event or change an event's status, **only after the user explicitly confirms** (enforced by the backend);
- draft Instagram posts and marketing emails in English, Arabic, or both, from real event data.

There is no REST API and no web interface: the MCP endpoint is the only thing the server exposes.

![Architecture: Claude, the MCP server, the services and MySQL](docs/architecture.png)

> **Connecting Claude?** The step-by-step guide (Claude Desktop, Claude Code, cloud tunnel), the demo prompts and troubleshooting are in **[docs/CONNECTING_CLAUDE.md](docs/CONNECTING_CLAUDE.md)**.

## How the client's requirements are met

| Requirement | Where |
|---|---|
| An MCP server connected to an events data source | `src/mcp/` (official MCP TypeScript SDK, Streamable HTTP) over a MySQL `events` table (`src/database/`) |
| At least four tools: search, details, create / update status, marketing messages in English and Arabic | Five tools: `search_events`, `get_event_details`, `add_event`, `update_event_status`, `draft_marketing_message` ([section 7](#7-mcp-tools)) |
| Integration with Claude or another MCP client | Claude Desktop, Claude Code and Claude's custom connectors ([section 6](#6-connecting-claude-to-the-mcp-server)); also verified with the official MCP Inspector and the SDK client |
| Confirmation before any event is created or changed | A two-step, token-based workflow enforced in the backend ([section 8](#8-the-confirmation-workflow)) |

## Contents

1. [Technology stack](#1-technology-stack)
2. [Project structure](#2-project-structure)
3. [Prerequisites](#3-prerequisites)
4. [Setup](#4-setup) — database, environment, install, migrations, seeders
5. [Running](#5-running)
6. [Connecting Claude to the MCP server](#6-connecting-claude-to-the-mcp-server)
7. [MCP tools](#7-mcp-tools)
8. [The confirmation workflow](#8-the-confirmation-workflow)
9. [Testing](#9-testing)
10. [Assumptions and design decisions](#10-assumptions-and-design-decisions)
11. [Limitations and production hardening](#11-limitations-and-production-hardening)
12. [Troubleshooting](#12-troubleshooting)
13. [Upgrading from the earlier REST + MCP version](#13-upgrading-from-the-earlier-rest--mcp-version)

---

## 1. Technology stack

| Concern | Choice |
|---|---|
| Runtime / language | Node.js ≥ 20 (verified on 20.20 and 22.23), TypeScript 7 |
| MCP | Official `@modelcontextprotocol/sdk` 1.x, Streamable HTTP transport (stateless) |
| HTTP hosting | Express 5, used only to host the `/mcp` endpoint |
| Database | MySQL 8 (≥ 8.0.16, for `CHECK` constraints) |
| ORM / migrations | Sequelize 6 + `sequelize-cli` |
| Validation | Zod 4 (one schema set, shared by the tool definitions and the services) |
| Tests | Jest 30 (SWC transform), using the SDK's own MCP client |

Sequelize stays on 6.x because 7.x is still published only as an alpha. Runtime dependencies: the MCP SDK, Express, Sequelize, `mysql2`, Zod and `dotenv`.

## 2. Project structure

```text
thirty-seven-events/
├── src/
│   ├── config/              env.ts (validated env), database.ts, sequelize-cli.config.ts
│   ├── database/
│   │   ├── models/          event.model.ts, pending-operation.model.ts
│   │   ├── migrations/      events table, pending_operations table
│   │   ├── seeders/         14 sample Saudi events
│   │   └── transaction.ts   transaction runner (injectable)
│   ├── modules/
│   │   ├── events/          service · repository · validation · command service (add / update status)
│   │   ├── confirmation/    confirmation service + repository (the safety workflow)
│   │   └── marketing/       service · EN/AR templates
│   ├── mcp/
│   │   ├── tools/           one file per MCP tool (parse → call service → format result)
│   │   ├── mcp-server.ts    builds the McpServer and registers the tools
│   │   ├── mcp-transport.ts the /mcp endpoint (Streamable HTTP, stateless)
│   │   └── tool-result.ts   turns service results and errors into MCP tool results
│   ├── middlewares/         error handler, 404 handler
│   ├── utils/               errors, hashing, date validation, logger
│   ├── container.ts         composition root (wires everything together)
│   ├── app.ts               Express app: the /mcp endpoint and nothing else
│   ├── bootstrap.ts         HTTP startup and graceful shutdown
│   └── server.ts            the entry point (npm run dev / npm start)
├── docs/                    architecture diagram (png + svg) and the Claude connection guide
├── scripts/demo.ts          demo MCP client (npm run demo)
├── tests/                   unit/ and integration/ (see section 9)
├── .env.example
├── jest.config.js
├── package.json
└── tsconfig.json
```

Layering: `MCP tool → service → repository → model`. Tool handlers only validate input, call a service and format the result; the business rules live once, in the services.

## 3. Prerequisites

- **Node.js 20 or newer** and npm.
- **MySQL 8.0.16 or newer**, running locally or reachable over the network.
- A MySQL account that can create databases (only for the one-time setup below).
- Developed and tested on **MySQL 8.0** only. Other MySQL-compatible servers (for example MariaDB) are untested, although the stored confirmation proposal is read correctly whether the driver returns JSON columns as objects or as text.

## 4. Setup

### 4.1 Create the MySQL databases

Run as a MySQL administrator (for example `mysql -u root -p`). Replace the password.

```sql
CREATE DATABASE thirty_seven_events      CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE thirty_seven_events_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER 't37'@'localhost' IDENTIFIED BY 'choose-a-strong-password';
GRANT ALL PRIVILEGES ON thirty_seven_events.*      TO 't37'@'localhost';
GRANT ALL PRIVILEGES ON thirty_seven_events_test.* TO 't37'@'localhost';
FLUSH PRIVILEGES;
```

The `_test` database is used only by the test suite (section 9). Tests refuse to run against any database whose name does not end in `_test`.

### 4.2 Environment variables

```bash
cp .env.example .env
# then edit .env: at minimum set DB_PASSWORD to the password you chose above
```

> **Keep the single quotes around `DB_PASSWORD`.** In a `.env` file an unquoted `#` starts a comment, so `DB_PASSWORD=pa#ss` is silently read as `pa` and MySQL answers *Access denied*. Single quotes are read literally (`DB_PASSWORD='pa#ss'`). If the password contains a single quote, wrap it in backticks instead.

| Variable | Default | Purpose |
|---|---|---|
| `NODE_ENV` | `development` | `development`, `test` or `production`. The logger is silent when `test`. |
| `DB_HOST` | `127.0.0.1` | MySQL host. |
| `DB_PORT` | `3306` | MySQL port. |
| `DB_NAME` | *(required)* | Database name. |
| `DB_USER` | *(required)* | Database user. |
| `DB_PASSWORD` | *(required)* | Database password. Keep it in single quotes. |
| `DB_LOGGING` | `false` | `true` prints every SQL statement. |
| `CONFIRMATION_TTL_SECONDS` | `300` | How long a confirmation token stays valid (1–3600). |
| `MCP_HOST` | `127.0.0.1` | Interface the server binds to. |
| `MCP_PORT` | `3001` | Port the server listens on. |
| `MCP_PATH` | `/mcp` | URL path of the MCP endpoint. |
| `MCP_ALLOWED_HOSTS` | *(empty)* | Comma-separated `Host` header values accepted by the endpoint. Empty means localhost only (`localhost`, `127.0.0.1`, `[::1]`). Set it to your public host name when the server is reached through a tunnel or reverse proxy. |
| `TEST_DB_NAME` | `thirty_seven_events_test` | Tests only; must end in `_test`. |

Configuration is validated at startup: an invalid value stops the process with a message naming the variable. Each setting goes on its own `NAME=value` line; never paste a command into `.env`.

### 4.3 Install

```bash
npm ci
```

### 4.4 Migrations

```bash
npm run db:migrate        # create the events and pending_operations tables
npm run db:migrate:undo   # drop everything (all migrations)
```

### 4.5 Seeders

```bash
npm run db:seed           # insert 14 realistic sample events (ids 1-14)
npm run db:seed:undo      # remove them
npm run db:reset          # undo migrations, migrate, seed — back to a clean start
```

The seed data uses **fictional clients** (for example "Najd Telecom") across all four statuses (`PLANNED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`), with varied budgets, dates and project counts.

## 5. Running

```bash
npm run dev                       # development, restarts on change

npm run build && npm start        # production build
```

The server listens on `http://127.0.0.1:3001` and answers only at **`/mcp`**. Any other path returns 404. It shuts down cleanly on `SIGINT`/`SIGTERM` (it stops accepting connections, closes the database pool and exits 0).

> **Under a process manager (systemd, Docker, PM2), run Node directly** — `node dist/server.js` — rather than `npm start`. In testing, a `SIGTERM` sent to the `npm start` wrapper did not reach Node and left the server running.

Quick check that it is answering (a second terminal):

```bash
curl -s -X POST http://127.0.0.1:3001/mcp \
  -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}'
```

A line of JSON containing `"serverInfo":{"name":"thirty-seven-events"` means it is healthy.

## 6. Connecting Claude to the MCP server

The endpoint speaks **Streamable HTTP**, stateless (no session id), with JSON responses. Pick the route that matches your Claude client. (A longer walkthrough with troubleshooting: [docs/CONNECTING_CLAUDE.md](docs/CONNECTING_CLAUDE.md).)

> **Where the connection comes from matters.** Claude's *custom connectors* (claude.ai, Claude Desktop, Cowork, mobile) connect **from Anthropic's cloud**, not from your computer, so the server must be **publicly reachable**; `localhost` will not work for them. Claude Code and the local Claude Desktop config run on your machine and *can* use `localhost`. See Anthropic's page *Get started with custom connectors using remote MCP* (support.claude.com) for the current menu labels, which change between releases.

### Option A — Claude Desktop with a local server (via `mcp-remote`)

`claude_desktop_config.json` only accepts local commands, so a small bridge turns the HTTP endpoint into a local stdio server. Open the file from Claude Desktop (**Settings → Developer → Edit Config**) and add:

```json
{
  "mcpServers": {
    "thirty-seven-events": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://127.0.0.1:3001/mcp"]
    }
  }
}
```

Typical locations: macOS `~/Library/Application Support/Claude/claude_desktop_config.json`, Windows `%APPDATA%\Claude\claude_desktop_config.json`. Fully quit and reopen Claude Desktop afterwards. `npx` must be on your `PATH`; if Claude Desktop cannot find it (common with `nvm`), use the full path from `which npx` as the `command`. The connector then appears under **Customize → Connectors** as **Desktop · Local dev**.

### Option B — Claude Code (runs locally; `localhost` works)

```bash
claude mcp add --transport http thirty-seven-events http://localhost:3001/mcp
claude mcp list
```

### Option C — Custom connector in Claude (public URL required)

1. Make the server reachable over **HTTPS** at a public URL, for example by running a tunnel (such as Cloudflare Tunnel or ngrok) to port 3001.
2. Tell the server which host name it will be called with, otherwise it answers `403 Invalid Host`. In `.env`, on separate lines:
   ```
   MCP_ALLOWED_HOSTS=your-tunnel-hostname.example.com
   MCP_PATH=/mcp/f3a9c1d27b6e
   ```
   then restart the server.
3. In Claude, go to **Customize → Connectors → Add custom connector**, enter the **full** address `https://your-tunnel-hostname.example.com/mcp/f3a9c1d27b6e`, and under **Authentication** choose **No sign-in** (this server has no authentication).
4. Enable the connector for the conversation from the **+** menu.

> ⚠️ **Security: read before exposing this publicly.** This server has **no authentication** (none was in scope). Anyone who can reach the URL can search every event and can add or change events by completing the two-step confirmation themselves — the confirmation workflow protects against an AI acting without the user's say-so, **not** against a deliberate caller. Treat a public tunnel as a short-lived demo only: use an unguessable `MCP_PATH`, shut it down afterwards, and add real authentication before any real use (see section 11).

### Option D — Any other MCP client, including a quick manual test

The official [MCP Inspector](https://github.com/modelcontextprotocol/inspector) CLI works against the running server:

```bash
npx @modelcontextprotocol/inspector --cli http://127.0.0.1:3001/mcp --transport http --method tools/list

npx @modelcontextprotocol/inspector --cli http://127.0.0.1:3001/mcp --transport http \
  --method tools/call --tool-name search_events --tool-arg client=Najd --tool-arg status=PLANNED
```

### Seeing it work

**Demo client (no Claude needed).** `scripts/demo.ts` connects to the running server exactly as an AI assistant would, using the official MCP SDK client, and walks through all five tools and the confirmation rule. With the server running (`npm run dev`), open a second terminal:

```bash
npm run demo               # interactive: you type y/n at each confirmation question
npm run demo -- --yes      # answers "yes" for you
npm run demo -- --no       # answers "no": shows that declining writes nothing
MCP_URL=https://your-host/mcp/secret-path npm run demo     # against a remote server
```

It searches, reads details, proposes a new event, shows that a changed budget and a made-up token are rejected, confirms the real one, shows that replaying the token is rejected, changes a status the same way, and drafts English and Arabic marketing copy. It creates one event for "Demo Client Ltd"; run `npm run db:reset` afterwards to return to the seed data.

**Live in Claude.** After connecting, try these in one conversation and check what Claude does:

1. *"Which events do we have for Najd Telecom?"* — Claude should call `search_events` and list two events.
2. *"Create an event called Saudi Tech Expo on 10 May 2027 for Kingdom Fintech Council, budget 310,500.50 SAR."* — Claude should show a summary and **ask before saving**. Check it has not been saved yet:
   `mysql -u t37 -p thirty_seven_events -e "SELECT id,event_name FROM events WHERE event_name='Saudi Tech Expo'"` (expect no rows).
3. *"Yes, go ahead."* — the event is created; repeat the query above (expect one row).
4. *"Mark it as in progress."* — Claude should again show a summary and ask first.
5. *"Write an Instagram post for it in English and Arabic."* — copy built only from the stored name, date, client and status.

Claude's own tool-approval prompts may appear as well; those are separate from this server's confirmation step. If Claude saves something without asking you, that is a behaviour to report, since the server itself will refuse any write that lacks a valid, matching token.

### What was and was not verified

Verified in development against a running server: the demo client above (all three answer modes), the official Inspector CLI (all five tools, including complete propose-then-confirm writes checked against MySQL), the `mcp-remote` bridge used by Option A, the SDK's own client, and raw JSON-RPC over HTTP. **Not verified in the build environment:** a live session inside a Claude application (no Claude client was available there) and a public HTTPS tunnel. Please try your Claude client against the local server first.

### Example conversation

> **You:** Create an event called Saudi Tech Expo on 10 May 2027 for Kingdom Fintech Council, budget 310,500.50 SAR.
>
> **Claude:** I am going to create the following event: Event name: Saudi Tech Expo · Date: 2027-05-10 · Client: Kingdom Fintech Council · Budget: SAR 310,500.5 · Number of projects: 0 · Status: PLANNED. Would you like me to proceed?
>
> **You:** Yes.
>
> **Claude:** Done — event #15 has been created.

Nothing is written until the second step; see the next sections.

## 7. MCP tools

| Tool | Purpose | Parameters |
|---|---|---|
| `search_events` | Find events. Filters combine with AND. | `event_date`, `date_from`, `date_to` (`YYYY-MM-DD`); `client` (case-insensitive partial match); `status`; `limit` (1–100, default 20); `offset` |
| `get_event_details` | All fields of one event. | `event_id` |
| `add_event` 🔒 | Create an event. | `event_name`, `event_date`, `client`, `budget` (SAR, ≤ 2 decimals) — required; `number_of_projects` (default 0), `status` (default `PLANNED`); `confirmation_token` |
| `update_event_status` 🔒 | Change an event's status. | `event_id`, `status`; `confirmation_token` |
| `draft_marketing_message` | Instagram post or email copy from the event's stored data. | `event_id`, `channel` (`INSTAGRAM_POST` \| `EMAIL`), `language` (`EN` \| `AR` \| `BOTH`, default `EN`) |

🔒 = two-step, requires confirmation (next section). Results are JSON text; failures set MCP's `isError` flag and return `{ "error": { "code", "message", "details?" } }`.

**Marketing drafts** use only the event's name, date, client and status as stored in MySQL. They never include the budget, and never invent venues, prices, links or contact details. Upcoming events get an invitation, in-progress events add "preparations are underway", completed events get a thank-you, and cancelled events are refused. Arabic drafts use the Gregorian calendar; event and client names are kept as stored (they are not translated).

## 8. The confirmation workflow

The client's rule is: *"The AI must ask for confirmation before it adds or changes any event."* This is enforced **in the backend**, not just by prompting.

```text
Step 1  call add_event / update_event_status WITHOUT confirmation_token
        → nothing is written
        → returns a human-readable summary, a confirmation_token, and its expiry

        (the AI shows the summary and asks "Would you like me to proceed?")

Step 2  only after the user explicitly says yes, call the SAME tool again
        with EXACTLY the same parameters plus the confirmation_token
        → the change is applied, the token is consumed
```

**Guarantees**

| Property | How it is enforced |
|---|---|
| No write before confirmation | Step 1 only stores a proposal; the write path requires a valid token. |
| Bound to the exact operation and parameters | The token is tied to the operation type and a hash of the canonicalised parameters. Any change is rejected. A rejected attempt does not burn the token. |
| Expires | `CONFIRMATION_TTL_SECONDS` (default 5 minutes). The exact expiry instant counts as expired. |
| Single use, even under concurrency | Consumed by an atomic `UPDATE … WHERE consumed_at IS NULL` inside the same transaction as the write. Of 30 simultaneous confirmations exactly one succeeds. |
| Confirmation and write succeed or fail together | One database transaction. If the write fails, the token is not consumed. |
| Stale proposals rejected | A status change records the status it was proposed from; if the event changed since, confirmation fails and a fresh proposal is needed. |
| Token never stored | Only its SHA-256 hash is in the database; tokens are 32 random bytes (base64url). |

**Error codes** (returned in the tool result as `error.code`)

| Code | Meaning |
|---|---|
| `CONFIRMATION_TOKEN_INVALID` | Token not recognised. |
| `CONFIRMATION_TOKEN_EXPIRED` | Token expired; request a new confirmation. |
| `CONFIRMATION_TOKEN_ALREADY_USED` | Token already consumed (including losing a race). |
| `CONFIRMATION_PARAMETERS_MISMATCH` | Parameters differ from the proposal, or the token is for another operation. |
| `CONFLICT` | Status unchanged, or the event changed since the proposal. |
| `NOT_FOUND` | Event does not exist. |
| `VALIDATION_ERROR` | Input failed validation (details per field), or marketing was requested for a cancelled event. |
| `INTERNAL_ERROR` | Unexpected failure; details are logged, never returned. |

Input that violates a tool's schema is rejected by the MCP SDK itself, before the tool runs, as an `isError` result with a plain validation message.

**Honest limit.** A server cannot prove that a *human* said "yes". It guarantees that nothing is written without a valid, matching, unexpired, unused token. Whether the AI really asked the user relies on the tool descriptions, the server instructions, the returned `instructions` text, and the client's own tool-approval prompt (Claude asks before running tools). A misbehaving model could call both steps back to back; keep tool approval enabled in your Claude client.

## 9. Testing

```bash
npm test                 # whole suite
npm run test:coverage    # with coverage
npm run typecheck        # type-check src, tests and scripts
```

Tests need the MySQL `_test` database from section 4.1 and the credentials in `.env`. The suite migrates that database itself, resets it between tests, and **never touches your development database**.

**What is covered** (335 tests, 15 suites):

| Area | Where |
|---|---|
| The client's 12 required scenarios — search by date, client, status; event details; add; update status; English and Arabic marketing drafts; rejecting creation and status updates without confirmation; expired tokens; duplicate confirmation | `tests/integration/requirements.test.ts` |
| Parameter binding, stale proposals, atomic rollback, token hashing, text-returning databases | `tests/integration/confirmation-safety.test.ts` |
| Tool catalogue and schemas, error semantics, input safety, transport edge cases, DNS-rebinding protection, state shared across clients | `tests/integration/mcp-protocol.test.ts` |
| Concurrent confirmations (including connection-pool exhaustion) | `tests/integration/concurrency.test.ts` |
| The server as a real process: startup, serving, SIGTERM, failing fast | `tests/integration/entrypoints.test.ts` |
| The atomic claim against MySQL | `tests/integration/pending-operation-repository.test.ts` |
| Units: input schemas, confirmation service, hashing, dates, errors, marketing, env, logger, database config | `tests/unit/` |

The tests drive the server through the **official MCP SDK client** over real HTTP, against a real MySQL test database. Token expiry uses an injected fake clock, so no test sleeps.

Coverage is 100% of statements, lines and functions (98% of branches). `src/server.ts` runs as a child process in `entrypoints.test.ts`, which Jest's counter cannot see, so it is excluded from the number. As a check on the tests themselves, 20 deliberate bugs were introduced one at a time (writing before confirmation, removing parameter binding or expiry, reintroducing a connection-pool deadlock, leaking the budget into marketing copy, switching to the Hijri calendar, removing host protection, and so on); the suite failed for every one.

## 10. Assumptions and design decisions

- **Currency** is Saudi riyals (SAR); `budget` is `DECIMAL(12,2)` (max 9,999,999,999.99) and returned as a number.
- **Dates** are calendar dates (`DATE`, no time or time zone). Marketing dates are formatted from that calendar date, independent of the server's time zone.
- **Status changes** are unrestricted (any status to any other), except that setting the status an event already has is rejected as pointless.
- **Search:** `event_date` is an exact match; `date_from`/`date_to` give an inclusive range; `client` is a case-insensitive partial match with `%` and `_` treated literally; results are ordered by date.
- **Duplicates:** event names are not unique. Two separate confirmed proposals create two events; replaying one token never creates a second.
- **Proposals are independent.** Each call without a token stores a new pending operation and returns a new token.
- **Validation:** unknown arguments are ignored (never stored). Text is trimmed. Omitted optional fields and their explicit defaults count as the same parameters.
- **Expiry precision:** MySQL `DATETIME` has one-second precision, so a token may expire up to half a second away from the advertised `expires_at`.
- **Transport:** MCP is stateless (no sessions); all state, including pending confirmations, is in MySQL. The endpoint answers `POST` only.
- **Marketing** is deterministic template text, not an LLM call, so it cannot invent facts. Marketing is refused for cancelled events.
- **Seed data** uses fictional clients so no real company is associated with sample events.
- **Dependencies** are the latest stable releases at the time of writing, except Sequelize (6.x, as 7.x is alpha).

## 11. Limitations and production hardening

- **No authentication or authorization** (out of scope for the assignment). Add this before exposing the service: for example a bearer token or OAuth check in front of `/mcp`.
- **No audit trail** of who confirmed a change (pending operations record the proposal, not an identity).
- **Expired pending operations are never purged.** The table grows slowly; add a periodic cleanup job.
- **No rate limiting or TLS termination.** Run behind a reverse proxy that provides HTTPS and limits.
- **Event updates are limited to status**; there is no edit or delete tool, by design of the brief.
- **`npm audit` reports advisories.** One affects a production dependency: `uuid` < 11.1.1 (GHSA-w5hq-g745-h8pq, a buffer bounds check in `uuid` v3/v5/v6 when a caller supplies an output buffer), pulled in by Sequelize 6. This application never calls `uuid` (it uses Node's built-in `crypto.randomUUID`), so it is not reachable here, and npm's suggested "fix" is a downgrade to a 2017 Sequelize release, which is not viable. The remaining findings are in development tooling only (Jest, `sequelize-cli`) and are not part of the production runtime. Re-check when Sequelize 7 becomes stable.
- **No Docker or deployment files**; nothing here deploys to the cloud.
- Pending confirmations are only as trustworthy as the database; restrict access to MySQL accordingly.

## 12. Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `ECONNREFUSED 127.0.0.1:3306` | MySQL is not running, or `DB_HOST`/`DB_PORT` are wrong. |
| `Access denied for user` | Wrong `DB_USER`/`DB_PASSWORD`, or the user lacks privileges on the database (section 4.1). If the password contains `#`, make sure it is wrapped in single quotes in `.env` (section 4.2). |
| `Invalid environment configuration: …` | A variable in `.env` is invalid; the message names it. |
| `403 Invalid Host` from `/mcp` | The request's `Host` header is not allowed. Set `MCP_ALLOWED_HOSTS` to the host name clients use (needed behind a tunnel or proxy), then restart. |
| Custom connector cannot connect | Claude connects from Anthropic's cloud; `localhost` is unreachable to it. Use a public HTTPS URL (Option C). |
| Connector check says `404` | The address has no path. Use the full address including `/mcp` (or your `MCP_PATH`). |
| `404` on `/mcp` | You changed `MCP_PATH`; use the new path in the client. |
| Changes to `.env` seem ignored | The server reads `.env` only at startup. Restart it. |
| `Refusing to run tests against …` | `TEST_DB_NAME` must end in `_test`. |
| `EADDRINUSE` | The port is taken; change `MCP_PORT`. |
| Migrations say nothing to do | They already ran; use `npm run db:reset` to start over. |

More Claude-specific problems (no tools showing, billing messages, two connectors, and so on) are in [docs/CONNECTING_CLAUDE.md](docs/CONNECTING_CLAUDE.md#9-troubleshooting).

## 13. Upgrading from the earlier REST + MCP version

The REST API (`/api/events…`) and Swagger (`/api-docs`) have been removed because the assignment asks only for an MCP server. The database, migrations, seed data, tools and confirmation workflow are unchanged, so no data migration is needed.

1. Stop any old server processes (the old REST server used port 3000).
2. Replace the project files, keeping your own `.env`; run `npm install` to drop the removed dependencies.
3. Start the server with `npm run dev` (or `npm run build && npm start`). It listens on the same address as before, `http://127.0.0.1:3001/mcp`, so Claude Desktop, Claude Code and connector settings keep working. The old `npm run dev:mcp` / `npm run start:mcp` scripts are now simply `npm run dev` / `npm start`.
4. `PORT` in `.env` is no longer used and can be deleted; leaving it does no harm.
