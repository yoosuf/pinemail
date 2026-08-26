# Pine Mail

A tiny, single-binary SMTP mail catcher for development environments — like Mailtrap or Mailpit, but written in Rust with a minimal footprint, structured as a monorepo, and built for agentic development: AI agents (and e2e tests) can discover, wait for, and extract data from captured emails via a REST API or an MCP server.

## Monorepo layout

```
crates/core/    pinemail-core   — shared SQLite store, MIME parsing, config, signal extraction
crates/server/  pinemail        — SMTP (1025) + HTTP API/UI (8025); what you deploy
crates/mcp/     pinemail-mcp    — MCP stdio server exposing the inbox to AI agents
apps/web/                       — React + Vite + TS frontend, embedded into `pinemail`
```

See [AGENTS.md](AGENTS.md) for the full architecture guide, dev commands, and the
agent-facing API (`/api/wait`, `/api/messages/:id/extract`, MCP tools).

## Features

- Accepts SMTP on port `1025` (no auth, no relaying — it's a dead-end catcher).
- Web UI + REST API on port `8025` with live updates over WebSockets.
- View HTML / plain-text bodies, raw headers, download attachments or the raw `.eml`.
- Search by from/to/subject, mark read, delete, or clear everything.
- Checkbox multi-select with bulk mark read/unread and bulk delete, and a lazily-loaded,
  paginated inbox (50 messages per page, more fetched on scroll) so memory/response
  size stay flat no matter how large the inbox gets.
- **Agent-friendly by design**: `GET /api/wait` long-polls for the next email matching
  a filter (great for e2e tests waiting on a signup/reset email), and
  `GET /api/messages/:id/extract` pulls OTP codes and links out of the body.
- **MCP server** (`pinemail-mcp`) exposes `list_emails`, `get_email`, `wait_for_email`,
  `extract_signals`, `delete_email`, `clear_inbox` as MCP tools for Claude/Copilot/Cursor.
- SQLite-backed storage (`/data/pinemail.db`) with automatic pruning past `MAX_MESSAGES`.
- No external dependencies at runtime — the whole frontend is embedded in the binary.

## Quick start (Docker)

```bash
docker compose up --build
```

Then point your app's SMTP client at `localhost:1025` and open the inbox at `http://localhost:8025`.

To also run the MCP server against it:
```bash
docker compose --profile mcp run --rm mcp
```

## Configuration (env vars)

| Variable        | Default              | Description                                  |
|-----------------|----------------------|-----------------------------------------------|
| `SMTP_PORT`     | `1025`               | Port the SMTP listener binds to               |
| `HTTP_PORT`     | `8025`               | Port the web UI / API binds to                |
| `BIND_ADDR`     | `0.0.0.0`            | Bind address for both servers                 |
| `DB_PATH`       | `/data/pinemail.db`  | SQLite file path (`:memory:` for ephemeral)   |
| `MAX_MESSAGES`  | `1000`               | Oldest messages are pruned past this count (`0` = unlimited) |
| `SMTP_HOSTNAME` | `pinemail`            | Hostname advertised in the SMTP greeting      |
| `PINEMAIL_URL`  | `http://127.0.0.1:8025` | (`pinemail-mcp` only) base URL of the running server |

## Local development

```bash
# Terminal 1 — frontend with hot reload, proxied to the Rust API
cd apps/web && npm install && npm run dev

# Terminal 2 — backend
cargo run -p pinemail-server
```

## Building the release binaries

```bash
cd apps/web && npm install && npm run build && cd ..
cargo build --release --workspace
```

The frontend must be built to `apps/web/dist` before `cargo build`, since it's embedded into the `pinemail` binary via `rust-embed`.

## Author

Built by [Yoosuf](https://yoosuf.me/), who also offers [fractional CTO services](https://yoosuf.me/services/).

