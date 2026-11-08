# Thirty Seven Events — MCP Server

> Give Claude safe, direct access to your event data. It can search events, add them, update their status and draft English and Arabic marketing copy — and it **always asks you first** before changing anything.

![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A520-339933?logo=nodedotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-7-3178C6?logo=typescript&logoColor=white)
![MCP](https://img.shields.io/badge/MCP-Streamable%20HTTP-6E56CF)
![MySQL](https://img.shields.io/badge/MySQL-8-4479A1?logo=mysql&logoColor=white)

![Architecture: Claude, the MCP server, the services and MySQL](docs/architech.png)

**Jump to:** [Quick start](#quick-start) · [Connect Claude](#connect-claude) · [Tools](#mcp-tools) · [Confirmation workflow](#the-confirmation-workflow) · [Troubleshooting](#troubleshooting)

---

<details>
<summary><strong>Table of contents</strong></summary>

- [Overview](#overview)
- [Quick start](#quick-start)
- [Connect Claude](#connect-claude)
- [MCP tools](#mcp-tools)
- [The confirmation workflow](#the-confirmation-workflow)
- [Configuration reference](#configuration-reference)
- [Technology and project structure](#technology-and-project-structure)
- [Testing](#testing)
- [Design decisions](#design-decisions)
- [Limitations and production hardening](#limitations-and-production-hardening)
- [Troubleshooting](#troubleshooting)

</details>

---

## Overview

This is an **MCP (Model Context Protocol) server** for **Thirty Seven (37 Events)**, an events management and marketing company in Saudi Arabia. It lets an AI assistant such as **Claude** work with the company's event data stored in **MySQL**:

- **Find things:** search events by date, client and status, and read the full details of one event.
- **Change things safely:** add an event or change an event's status, **only after the user explicitly confirms** — enforced by the backend, not just by prompting.
- **Write marketing copy:** draft Instagram posts and marketing emails in English, Arabic, or both, from real event data.

There is no REST API and no web interface. The MCP endpoint is the only thing the server exposes.

### How the client's requirements are met

| Requirement                                                                                            | Where                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| An MCP server connected to an events data source                                                       | `src/mcp/` (official MCP TypeScript SDK, Streamable HTTP) over a MySQL `events` table (`src/database/`)                                                               |
| At least four tools: search, details, create / update status, marketing messages in English and Arabic | Five tools: `search_events`, `get_event_details`, `add_event`, `update_event_status`, `draft_marketing_message` — see [MCP tools](#mcp-tools)                         |
| Integration with Claude or another MCP client                                                          | Claude Desktop, Claude Code and Claude's custom connectors — see [Connect Claude](#connect-claude). Also verified with the official MCP Inspector and the SDK client. |
| Confirmation before any event is created or changed                                                    | A two-step, token-based workflow enforced in the backend — see [The confirmation workflow](#the-confirmation-workflow)                                                |

### See it in action

> **You:** Create an event called Saudi Tech Expo on 10 May 2027 for Kingdom Fintech Council, budget 310,500.50 SAR.
>
> **Claude:** I am going to create the following event: Event name: Saudi Tech Expo · Date: 2027-05-10 · Client: Kingdom Fintech Council · Budget: SAR 310,500.5 · Number of projects: 0 · Status: PLANNED. Would you like me to proceed?
>
> **You:** Yes.
>
> **Claude:** Done — event #15 has been created.

Nothing is written until the second step. If you answer "no", the database is never touched.

---

## Quick start

You will need **Node.js 20+**, **npm** and **MySQL 8.0.16+** (running locally or reachable over the network). The project is developed and tested on MySQL 8.0 only; other MySQL-compatible servers such as MariaDB are untested.

### 1. Create the databases

Run this once as a MySQL administrator (for example `mysql -u root -p`) and replace the password:

```sql
CREATE DATABASE thirty_seven_events      CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE thirty_seven_events_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER 't37'@'localhost' IDENTIFIED BY 'choose-a-strong-password';
GRANT ALL PRIVILEGES ON thirty_seven_events.*      TO 't37'@'localhost';
GRANT ALL PRIVILEGES ON thirty_seven_events_test.* TO 't37'@'localhost';
FLUSH PRIVILEGES;
```

The `_test` database is used only by the test suite, which refuses to run against any database whose name does not end in `_test`.

### 2. Configure

```bash
cp .env.example .env
```

Open `.env` and set at least `DB_USER` and `DB_PASSWORD` to the account you just created.

> [!IMPORTANT]
> **Keep the single quotes around `DB_PASSWORD`.** In a `.env` file an unquoted `#` starts a comment, so `DB_PASSWORD=pa#ss` is silently read as `pa` and MySQL answers _Access denied_. Single quotes are read literally: `DB_PASSWORD='pa#ss'`. If the password contains a single quote, wrap it in backticks instead.

Each setting goes on its own `NAME=value` line. Never paste a command into `.env`. All settings are listed in the [configuration reference](#configuration-reference).

### 3. Install and prepare the data

```bash
npm ci                 # install dependencies
npm run db:migrate     # create the events and pending_operations tables
npm run db:seed        # insert 14 realistic sample events (ids 1-14)
```

The sample data uses **fictional clients** (for example "Najd Telecom") across all four statuses (`PLANNED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`), with varied budgets, dates and project counts.

<details>
<summary>Other database commands</summary>

```bash
npm run db:migrate:undo   # drop everything (all migrations)
npm run db:seed:undo      # remove the sample events
npm run db:reset          # undo migrations, migrate, seed: back to a clean start
```

</details>

### 4. Start the server

```bash
npm run dev                       # development, restarts on change

npm run build && npm start        # production build
```

The server listens on `http://127.0.0.1:3001` and answers only at **`/mcp`**; any other path returns 404. It shuts down cleanly on `SIGINT`/`SIGTERM`: it stops accepting connections, closes the database pool and exits 0.

> [!TIP]
> **Under a process manager (systemd, Docker, PM2), run Node directly** — `node dist/server.js` — rather than `npm start`. In testing, a `SIGTERM` sent to the `npm start` wrapper did not reach Node and left the server running.

### 5. Check that it is answering

In a second terminal:

```bash
curl -s -X POST http://127.0.0.1:3001/mcp \
  -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}'
```

A line of JSON containing `"serverInfo":{"name":"thirty-seven-events"` means it is healthy.

**Next step:** [connect Claude](#connect-claude).

---

## Connect Claude

The endpoint speaks **Streamable HTTP**: stateless (no session id) with JSON responses. Pick the route that matches how you use Claude.

| I want to use…                                    | Route                                                  | Works with `localhost`? | Best for                            |
| ------------------------------------------------- | ------------------------------------------------------ | :---------------------: | ----------------------------------- |
| Claude Desktop on my computer                     | [Option&nbsp;A](#option-a-claude-desktop-local)        |           Yes           | Everyday use and demos              |
| Claude Code                                       | [Option&nbsp;B](#option-b-claude-code-local)           |           Yes           | Developers                          |
| Claude on the web or phone, or a custom connector | [Option&nbsp;C](#option-c-custom-connector-public-url) |         **No**          | Short demos away from your computer |
| Any other MCP client, or a quick manual test      | [Option&nbsp;D](#option-d-any-other-mcp-client)        |           Yes           | Verification                        |

> [!NOTE]
> **Where the connection starts matters.** Claude's _custom connectors_ (claude.ai, Claude Desktop, Cowork, mobile) connect **from Anthropic's cloud**, not from your computer, so the server must be **publicly reachable**. `localhost` will not work for them. Claude Code and the local Claude Desktop config run on your machine and _can_ use `localhost`. Menu labels change between releases; see Anthropic's page _Get started with custom connectors using remote MCP_ (support.claude.com) for the current ones.

For a longer walkthrough with extra troubleshooting, see **[docs/CONNECTING_CLAUDE.md](docs/CONNECTING_CLAUDE.md)**.

### Option A: Claude Desktop (local)

`claude_desktop_config.json` only accepts local commands, so a small bridge, `mcp-remote`, turns the HTTP endpoint into a local one.

1. In Claude Desktop open **Settings → Developer → Edit Config** and add:

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

2. Fully quit and reopen Claude Desktop.
3. Open **Customize → Connectors**. The server appears as **Desktop · Local dev**.

Typical config file locations: macOS `~/Library/Application Support/Claude/claude_desktop_config.json`, Windows `%APPDATA%\Claude\claude_desktop_config.json`.

> [!TIP]
> `npx` must be on your `PATH`. If Claude Desktop cannot find it (common when Node was installed with `nvm`), run `which npx` and use that full path as the `command`.

### Option B: Claude Code (local)

```bash
claude mcp add --transport http thirty-seven-events http://localhost:3001/mcp
claude mcp list
```

### Option C: Custom connector (public URL)

1. **Expose the server over HTTPS.** Run a tunnel (such as Cloudflare Tunnel or ngrok) to port 3001. It prints a public address such as `https://random-words.trycloudflare.com`.
2. **Tell the server which host name it will be called with**, otherwise it answers `403 Invalid Host`. In `.env`, on separate lines:

   ```
   MCP_ALLOWED_HOSTS=your-tunnel-hostname.example.com
   MCP_PATH=/mcp/f3a9c1d27b6e
   ```

   Use the host name only (no `https://`, no path). `MCP_PATH` is a secret you choose yourself — any random letters and digits after `/mcp/`. Then **restart the server**.

3. **Add the connector.** In Claude go to **Customize → Connectors → Add custom connector**. Enter the **full** address, including the path:
   `https://your-tunnel-hostname.example.com/mcp/f3a9c1d27b6e`
   Under **Authentication** choose **No sign-in**.
4. Switch the connector on for your conversation from the **+** menu.

> [!WARNING]
> **This server has no authentication** (none was in scope). Anyone who can reach the URL can search every event and can add or change events by completing the two-step confirmation themselves. The confirmation workflow protects against an AI acting without the user's say-so, **not** against a deliberate caller.
>
> Treat a public tunnel as a short-lived demo: use an unguessable `MCP_PATH`, shut the tunnel down afterwards, and add real authentication before any real use (see [Limitations](#limitations-and-production-hardening)).

### Option D: Any other MCP client

The official [MCP Inspector](https://github.com/modelcontextprotocol/inspector) command-line tool works against the running server:

```bash
npx @modelcontextprotocol/inspector --cli http://127.0.0.1:3001/mcp --transport http --method tools/list

npx @modelcontextprotocol/inspector --cli http://127.0.0.1:3001/mcp --transport http \
  --method tools/call --tool-name search_events --tool-arg client=Najd --tool-arg status=PLANNED
```

### Try it

**With Claude.** After connecting, ask these in one conversation and watch what Claude does:

1. _"Which events do we have for Najd Telecom?"_ — Claude should call `search_events` and list two events.
2. _"Create an event called Saudi Tech Expo on 10 May 2027 for Kingdom Fintech Council, budget 310,500.50 SAR."_ — Claude should show a summary and **ask before saving**. Confirm nothing was saved yet:
   `mysql -u t37 -p thirty_seven_events -e "SELECT id,event_name FROM events WHERE event_name='Saudi Tech Expo'"` (expect no rows).
3. _"Yes, go ahead."_ — the event is created. Run the same query again (expect one row).
4. _"Mark it as in progress."_ — Claude should again show a summary and ask first.
5. _"Write an Instagram post for it in English and Arabic."_ — copy built only from the stored name, date, client and status.

Claude's own tool-approval prompts may also appear; they are separate from this server's confirmation step. If Claude ever saves something without asking you, please report it. The server itself refuses any write that lacks a valid, matching token.

**Without Claude: the demo client.** `scripts/demo.ts` connects to the running server exactly as an AI assistant would, using the official MCP SDK client, and walks through all five tools and the confirmation rule:

```bash
npm run demo               # interactive: you type y/n at each confirmation question
npm run demo -- --yes      # answers "yes" for you
npm run demo -- --no       # answers "no": shows that declining writes nothing
MCP_URL=https://your-host/mcp/secret-path npm run demo     # against a remote server
```

It searches, reads details, proposes a new event, shows that a changed budget and a made-up token are rejected, confirms the real one, shows that replaying the token is rejected, changes a status the same way, and drafts English and Arabic marketing copy. It creates one event for "Demo Client Ltd"; run `npm run db:reset` afterwards to return to the sample data.

### What has and has not been verified

**Verified** in development against a running server: the demo client (all three answer modes), the official Inspector CLI (all five tools, including complete propose-then-confirm writes checked against MySQL), the `mcp-remote` bridge used by Option A, the SDK's own client, and raw JSON-RPC over HTTP.

**Not verified in the build environment:** a live session inside a Claude application (no Claude client was available there) and a public HTTPS tunnel. Please try your Claude client against the local server first.

---

## MCP tools

| Tool                      | What it does                                                     | Parameters                                                                                                                                                                               |
| ------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `search_events`           | Find events. Filters combine with AND.                           | `event_date`, `date_from`, `date_to` (`YYYY-MM-DD`); `client` (case-insensitive partial match); `status`; `limit` (1–100, default 20); `offset`                                          |
| `get_event_details`       | Return all fields of one event.                                  | `event_id`                                                                                                                                                                               |
| `add_event` 🔒            | Create an event.                                                 | **Required:** `event_name`, `event_date`, `client`, `budget` (SAR, up to 2 decimals). **Optional:** `number_of_projects` (default 0), `status` (default `PLANNED`), `confirmation_token` |
| `update_event_status` 🔒  | Change an event's status.                                        | `event_id`, `status`, `confirmation_token`                                                                                                                                               |
| `draft_marketing_message` | Write Instagram post or email copy from the event's stored data. | `event_id`, `channel` (`INSTAGRAM_POST` \| `EMAIL`), `language` (`EN` \| `AR` \| `BOTH`, default `EN`)                                                                                   |

🔒 = two-step tool that requires confirmation (see the next section). Results are JSON text. Failures set MCP's `isError` flag and return `{ "error": { "code", "message", "details?" } }`.

**About the marketing drafts.** They use only the event's name, date, client and status as stored in MySQL. They never include the budget, and never invent venues, prices, links or contact details.

| Event status  | Draft style                                         |
| ------------- | --------------------------------------------------- |
| `PLANNED`     | An invitation                                       |
| `IN_PROGRESS` | An invitation that adds "preparations are underway" |
| `COMPLETED`   | A thank-you message                                 |
| `CANCELLED`   | Refused                                             |

Arabic drafts use the Gregorian calendar. Event and client names are kept as stored (they are not translated).

---

## The confirmation workflow

The client's rule is: _"The AI must ask for confirmation before it adds or changes any event."_ This is enforced **in the backend**, not just by prompting.

```text
Step 1  call add_event / update_event_status WITHOUT confirmation_token
        → nothing is written
        → returns a human-readable summary, a confirmation_token, and its expiry

        (the AI shows the summary and asks "Would you like me to proceed?")

Step 2  only after the user explicitly says yes, call the SAME tool again
        with EXACTLY the same parameters plus the confirmation_token
        → the change is applied, the token is consumed
```

### Guarantees

| Property                                        | How it is enforced                                                                                                                                           |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| No write before confirmation                    | Step 1 only stores a proposal; the write path requires a valid token.                                                                                        |
| Bound to the exact operation and parameters     | The token is tied to the operation type and a hash of the canonicalised parameters. Any change is rejected. A rejected attempt does not burn the token.      |
| Expires                                         | After `CONFIRMATION_TTL_SECONDS` (default 5 minutes). The exact expiry instant counts as expired.                                                            |
| Single use, even under concurrency              | Consumed by an atomic `UPDATE … WHERE consumed_at IS NULL` inside the same transaction as the write. Of 30 simultaneous confirmations, exactly one succeeds. |
| Confirmation and write succeed or fail together | One database transaction. If the write fails, the token is not consumed.                                                                                     |
| Stale proposals rejected                        | A status change records the status it was proposed from. If the event changed since, confirmation fails and a fresh proposal is needed.                      |
| Token never stored                              | Only its SHA-256 hash is in the database. Tokens are 32 random bytes (base64url).                                                                            |

### Error codes

Returned in the tool result as `error.code`:

| Code                               | Meaning                                                                                        |
| ---------------------------------- | ---------------------------------------------------------------------------------------------- |
| `CONFIRMATION_TOKEN_INVALID`       | Token not recognised.                                                                          |
| `CONFIRMATION_TOKEN_EXPIRED`       | Token expired; request a new confirmation.                                                     |
| `CONFIRMATION_TOKEN_ALREADY_USED`  | Token already consumed (including losing a race).                                              |
| `CONFIRMATION_PARAMETERS_MISMATCH` | Parameters differ from the proposal, or the token is for another operation.                    |
| `CONFLICT`                         | Status unchanged, or the event changed since the proposal.                                     |
| `NOT_FOUND`                        | Event does not exist.                                                                          |
| `VALIDATION_ERROR`                 | Input failed validation (details per field), or marketing was requested for a cancelled event. |
| `INTERNAL_ERROR`                   | Unexpected failure; details are logged, never returned.                                        |

Input that violates a tool's schema is rejected by the MCP SDK itself, before the tool runs, as an `isError` result with a plain validation message.

> [!NOTE]
> **An honest limit.** A server cannot prove that a _human_ said "yes". It guarantees that nothing is written without a valid, matching, unexpired, unused token. Whether the AI really asked the user relies on the tool descriptions, the server instructions, the returned `instructions` text, and the client's own tool-approval prompt (Claude asks before running tools). A misbehaving model could call both steps back to back, so keep tool approval enabled in your Claude client.

---

## Configuration reference

Configuration is validated at startup: an invalid value stops the process with a message naming the variable. Copy `.env.example` to `.env` and edit it.

**Database**

| Variable             | Default                    | Purpose                                                                                                                                                |
| -------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DB_HOST`            | `127.0.0.1`                | MySQL host.                                                                                                                                            |
| `DB_PORT`            | `3306`                     | MySQL port.                                                                                                                                            |
| `DB_NAME`            | _(required)_               | Database name.                                                                                                                                         |
| `DB_USER`            | _(required)_               | Database user.                                                                                                                                         |
| `DB_PASSWORD`        | _(required in production)_ | Database password. Empty is accepted only outside production, for a local MySQL configured without a password. Keep non-empty values in single quotes. |
| `DB_LOGGING`         | `false`                    | `true` prints every SQL statement.                                                                                                                     |
| `DB_POOL_MAX`        | `5`                        | Maximum shared MySQL connections in the Sequelize pool.                                                                                                |
| `DB_POOL_MIN`        | `0`                        | Minimum connections kept in the pool; must not exceed `DB_POOL_MAX`.                                                                                   |
| `DB_POOL_IDLE_MS`    | `10000`                    | Milliseconds before an idle connection can be released.                                                                                                |
| `DB_POOL_ACQUIRE_MS` | `60000`                    | Maximum milliseconds to wait for a pooled connection.                                                                                                  |

**MCP server**

| Variable                   | Default     | Purpose                                                                                                                                                                                                                  |
| -------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `MCP_HOST`                 | `127.0.0.1` | Interface the server binds to.                                                                                                                                                                                           |
| `MCP_PORT`                 | `3001`      | Port the server listens on.                                                                                                                                                                                              |
| `MCP_PATH`                 | `/mcp`      | URL path of the MCP endpoint.                                                                                                                                                                                            |
| `MCP_ALLOWED_HOSTS`        | _(empty)_   | Comma-separated `Host` header values the endpoint accepts. Empty means localhost only (`localhost`, `127.0.0.1`, `[::1]`). Set it to your public host name when the server is reached through a tunnel or reverse proxy. |
| `CONFIRMATION_TTL_SECONDS` | `300`       | How long a confirmation token stays valid (1–3600).                                                                                                                                                                      |

**General and testing**

| Variable       | Default                    | Purpose                                                                  |
| -------------- | -------------------------- | ------------------------------------------------------------------------ |
| `NODE_ENV`     | `development`              | `development`, `test` or `production`. The logger is silent when `test`. |
| `TEST_DB_NAME` | `thirty_seven_events_test` | Tests only; must end in `_test`.                                         |

---

## Technology and project structure

| Concern            | Choice                                                                          |
| ------------------ | ------------------------------------------------------------------------------- |
| Runtime / language | Node.js ≥ 20 (verified on 20.20 and 22.23), TypeScript 7                        |
| MCP                | Official `@modelcontextprotocol/sdk` 1.x, Streamable HTTP transport (stateless) |
| HTTP hosting       | Express 5, used only to host the `/mcp` endpoint                                |
| Database           | MySQL 8 (≥ 8.0.16, for `CHECK` constraints)                                     |
| ORM / migrations   | Sequelize 6 + `sequelize-cli`                                                   |
| Validation         | Zod 4 (one schema set, shared by the tool definitions and the services)         |
| Tests              | Jest 30 (SWC transform), using the SDK's own MCP client                         |

Sequelize stays on 6.x because 7.x is still published only as an alpha. Runtime dependencies: the MCP SDK, Express, Sequelize, `mysql2`, Zod and `dotenv`.

```text
thirty-seven-events-mcp-server/
├── src/
│   ├── config/              env.ts (validated env), database.ts, messages.ts, mcp-tools.config.ts, sequelize-cli.config.ts
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
│   ├── utils/               errors, error-response.ts, hashing, date validation, logger
│   ├── container.ts         composition root (wires everything together)
│   ├── app.ts               Express app: the /mcp endpoint and nothing else
│   ├── bootstrap.ts         HTTP startup and graceful shutdown
│   └── server.ts            the entry point (npm run dev / npm start)
├── docs/                    architecture diagram (png + svg) and the Claude connection guide
├── scripts/demo.ts          demo MCP client (npm run demo)
├── tests/                   unit/ and integration/ (see Testing)
├── .env.example
├── jest.config.js
├── package.json
└── tsconfig.json
```

**Layering:** `MCP tool → service → repository → model`. Tool handlers only validate input, call a service and format the result; the business rules live once, in the services.

- MCP server and tool metadata (names, titles, descriptions, input schemas and annotations) is centralised in `src/config/mcp-tools.config.ts`.
- Shared application, validation and MCP error text is defined in `src/config/messages.ts`.
- HTTP and MCP tool errors use one response formatter, `src/utils/error-response.ts`.

---

## Testing

```bash
npm test                 # whole suite
npm run test:coverage    # with coverage
npm run typecheck        # type-check src, tests and scripts
```

Tests need the MySQL `_test` database from the [quick start](#1-create-the-databases) and the credentials in `.env`. The suite migrates that database itself, resets it between tests, and **never touches your development database**.

**What is covered** (335 tests in 15 suites):

| Area                                                                                                                                                                                                                                              | Where                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| The client's 12 required scenarios: search by date, client and status; event details; add; update status; English and Arabic marketing drafts; rejecting creation and status updates without confirmation; expired tokens; duplicate confirmation | `tests/integration/requirements.test.ts`                 |
| Parameter binding, stale proposals, atomic rollback, token hashing, text-returning databases                                                                                                                                                      | `tests/integration/confirmation-safety.test.ts`          |
| Tool catalogue and schemas, error semantics, input safety, transport edge cases, DNS-rebinding protection, state shared across clients                                                                                                            | `tests/integration/mcp-protocol.test.ts`                 |
| Concurrent confirmations, including connection-pool exhaustion                                                                                                                                                                                    | `tests/integration/concurrency.test.ts`                  |
| The server as a real process: startup, serving, SIGTERM, failing fast                                                                                                                                                                             | `tests/integration/entrypoints.test.ts`                  |
| The atomic claim against MySQL                                                                                                                                                                                                                    | `tests/integration/pending-operation-repository.test.ts` |
| Units: input schemas, confirmation service, hashing, dates, errors, marketing, env, logger, database config                                                                                                                                       | `tests/unit/`                                            |

The tests drive the server through the **official MCP SDK client** over real HTTP, against a real MySQL test database. Token expiry uses an injected fake clock, so no test sleeps.

Coverage is 100% of statements, lines and functions (98% of branches). `src/server.ts` runs as a child process in `entrypoints.test.ts`, which Jest's counter cannot see, so it is excluded from the number.

**Do the tests actually catch bugs?** As a check on the tests themselves, 20 deliberate bugs were introduced one at a time and the suite failed for every one. They included writing before confirmation, removing parameter binding or expiry, reintroducing a connection-pool deadlock, leaking the budget into marketing copy, switching to the Hijri calendar, and removing host protection.

---

## Design decisions

<details>
<summary>Assumptions made during development</summary>

- **Currency** is Saudi riyals (SAR). `budget` is `DECIMAL(12,2)` (max 9,999,999,999.99) and is returned as a number.
- **Dates** are calendar dates (`DATE`, no time or time zone). Marketing dates are formatted from that calendar date, independent of the server's time zone.
- **Status changes** are unrestricted (any status to any other), except that setting the status an event already has is rejected as pointless.
- **Search:** `event_date` is an exact match; `date_from`/`date_to` give an inclusive range; `client` is a case-insensitive partial match with `%` and `_` treated literally; results are ordered by date.
- **Duplicates:** event names are not unique. Two separate confirmed proposals create two events; replaying one token never creates a second.
- **Proposals are independent.** Each call without a token stores a new pending operation and returns a new token.
- **Validation:** unknown arguments are ignored (never stored). Text is trimmed. Omitted optional fields and their explicit defaults count as the same parameters.
- **Expiry precision:** MySQL `DATETIME` has one-second precision, so a token may expire up to half a second away from the advertised `expires_at`.
- **Transport:** MCP is stateless (no sessions). All state, including pending confirmations, is in MySQL. The endpoint answers `POST` only.
- **Marketing** is deterministic template text, not an LLM call, so it cannot invent facts. It is refused for cancelled events.
- **Seed data** uses fictional clients, so no real company is associated with sample events.
- **Dependencies** are the latest stable releases at the time of writing, except Sequelize (6.x, as 7.x is alpha).

</details>

---

## Limitations and production hardening

Before using this beyond a demo, plan for the following:

- **No authentication or authorization** (out of scope for the assignment). Add it before exposing the service, for example a bearer token or OAuth check in front of `/mcp`.
- **No audit trail** of who confirmed a change. Pending operations record the proposal, not an identity.
- **Expired pending operations are never purged.** The table grows slowly; add a periodic cleanup job.
- **No rate limiting or TLS termination.** Run behind a reverse proxy that provides HTTPS and limits.
- **Event updates are limited to status.** There is no edit or delete tool, by design of the brief.
- **No Docker or deployment files.** Nothing here deploys to the cloud.
- **Pending confirmations are only as trustworthy as the database.** Restrict access to MySQL accordingly.

<details>
<summary>Note on <code>npm audit</code></summary>

`npm audit` reports advisories. One affects a production dependency: `uuid` < 11.1.1 (GHSA-w5hq-g745-h8pq, a buffer bounds check in `uuid` v3/v5/v6 when a caller supplies an output buffer), pulled in by Sequelize 6. This application never calls `uuid` (it uses Node's built-in `crypto.randomUUID`), so it is not reachable here, and npm's suggested "fix" is a downgrade to a 2017 Sequelize release, which is not viable. The remaining findings are in development tooling only (Jest, `sequelize-cli`) and are not part of the production runtime. Re-check when Sequelize 7 becomes stable.

</details>

---

## Troubleshooting

| Symptom                                        | Cause and fix                                                                                                                                                                                                     |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ECONNREFUSED 127.0.0.1:3306`                  | MySQL is not running, or `DB_HOST` / `DB_PORT` are wrong.                                                                                                                                                         |
| `Access denied for user`                       | Wrong `DB_USER` / `DB_PASSWORD`, or the user lacks privileges on the database ([Quick start, step 1](#1-create-the-databases)). If the password contains `#`, make sure it is wrapped in single quotes in `.env`. |
| `Invalid environment configuration: …`         | A variable in `.env` is invalid; the message names it.                                                                                                                                                            |
| Changes to `.env` seem ignored                 | The server reads `.env` only at startup. Restart it.                                                                                                                                                              |
| `EADDRINUSE`                                   | The port is taken. Change `MCP_PORT`.                                                                                                                                                                             |
| `403 Invalid Host` from `/mcp`                 | The request's `Host` header is not allowed. Set `MCP_ALLOWED_HOSTS` to the host name clients use (needed behind a tunnel or proxy), then restart.                                                                 |
| Custom connector cannot connect                | Claude connects from Anthropic's cloud, so `localhost` is unreachable to it. Use a public HTTPS URL ([Option C](#option-c-custom-connector-public-url)).                                                          |
| Connector check says `404`, or `404` on `/mcp` | The address has no path, or you changed `MCP_PATH`. Use the full address including `/mcp` (or your `MCP_PATH`) and make sure the client uses the same path.                                                       |
| `Refusing to run tests against …`              | `TEST_DB_NAME` must end in `_test`.                                                                                                                                                                               |
| Migrations say nothing to do                   | They already ran. Use `npm run db:reset` to start over.                                                                                                                                                           |

More Claude-specific problems (no tools showing, billing messages, two connectors, and so on) are covered in [docs/CONNECTING_CLAUDE.md](docs/CONNECTING_CLAUDE.md#9-troubleshooting).
