# AGENTS.md

Guide for AI coding agents (and humans) working in this repo, and for AI agents that
use Pine Mail *at runtime* during agentic development / e2e testing.

## Monorepo layout

```
pine-mail/
├── crates/
│   ├── core/     pinemail-core   — shared lib: SQLite store, MIME parsing, config, signal extraction
│   ├── server/   pinemail        — SMTP (1025) + HTTP API/UI (8025), the thing you deploy
│   └── mcp/      pinemail-mcp    — MCP stdio server, thin HTTP client over the REST API
├── apps/
│   └── web/                       — React + Vite + TS frontend, embedded into `pinemail` at build time
├── Cargo.toml                      — workspace root
├── Dockerfile / docker-compose.yml
└── README.md
```

Dependency direction: `server` and `mcp` both depend on `core` for shared types
(`MessageSummary`, `MessageDetail`, `ExtractedSignals`, etc.), but `mcp` talks to
`server` over HTTP rather than sharing the SQLite file — keep it that way so the two
binaries can run on different hosts/containers without file-locking concerns.

## Build & dev commands

```bash
# whole workspace
cargo check --workspace
cargo build --workspace          # debug builds of pinemail + pinemail-mcp
cargo build --release --workspace

# frontend (must be built before the server binary embeds it)
cd apps/web && npm install && npm run build

# run locally
cargo run -p pinemail-server            # http://localhost:8025, smtp on :1025
cargo run -p pinemail-mcp                # reads PINEMAIL_URL, talks JSON-RPC over stdio

# docker
docker compose up --build                 # server + smtp
docker compose --profile mcp run --rm mcp # one-off MCP stdio session against the running server
```

## Adding a feature that touches storage or mail parsing

Put it in `crates/core` (`store.rs` / `mail.rs` / `models.rs`), then expose it from
both `crates/server/src/api/messages.rs` (REST) and, if it's useful to agents,
`crates/mcp/src/main.rs` (as a new tool). Don't duplicate parsing/SQL logic in the
server or mcp crates — they should just be thin transports over `core`.

## Runtime API for agentic email discovery

This is the part that matters if you're an agent driving an e2e test (signup flow,
password reset, magic-link login, etc.) against an app that sends mail through this
catcher. Two ways in:

### 1. REST API directly

- `GET /api/wait?to=&from=&subject=&since=&timeout_ms=` — **long-polls** (server-side,
  up to `timeout_ms`, default 10s, max 60s) until a message matching the given
  substrings arrives, then returns its full `MessageDetail`. Filters are AND'd
  together and all optional. `since` defaults to "now", so pre-existing mail in the
  inbox never falsely matches — call this right after triggering the action that's
  supposed to send the email.
- `GET /api/messages/:id/extract` — returns `{ codes: string[], links: string[] }`
  pulled out of the body via regex (4-8 digit runs for OTPs, `https?://…` for magic
  links). Saves agents from writing their own extraction regex.
- `GET /api/sms/wait?to=&from=&body=&since=&timeout_ms=` — **long-polls** until a matching SMS arrives.
- `POST /api/sms` & `POST /api/sms/webhook` — ingest incoming SMS messages (supports standard JSON or Twilio webhooks).
- `GET /api/sms/:id/extract` — returns `{ codes: string[], links: string[] }` pulled out of the SMS body via regex.
- Everything else under `/api/messages` and `/api/sms` (list/get/delete/clear/mark-read) works as a normal REST resource.

Typical agent flow:
```
1. capture `since = now()` BEFORE triggering anything (see gotcha below)
2. trigger the app action that should send an email/SMS (e.g. POST /signup or POST /send-otp)
3. GET /api/wait (for email) or GET /api/sms/wait (for SMS) with since=<step 1>
4. GET /api/messages/{id}/extract or GET /api/sms/{id}/extract -> grab codes[0] or links[0]
5. use that code/link to complete the flow
6. DELETE /api/messages/{id} or DELETE /api/sms/{id} (optional cleanup)
```

> **Gotcha:** `since` defaults to "now" *at the moment `/api/wait` or `/api/sms/wait` is called*, not
> when you started the flow. If you trigger the action first and only call
> `/api/wait` afterwards, the email/SMS can already exist with a `received_at` before
> that default `since` and get silently filtered out (this bit us in
> `examples/mcp_e2e_demo.py` during testing). Always capture the timestamp
> before triggering the action and pass it explicitly as `since`/`since_ms`.

### 2. MCP server (`pinemail-mcp`)

For MCP-aware agents (Claude Desktop, Copilot, Cursor, etc.), point the client at the
`pinemail-mcp` binary (stdio transport) with `PINEMAIL_URL` set to the running
server. It exposes the same capability as MCP tools:
- Email tools: `list_emails`, `get_email`, `wait_for_email`, `extract_signals`, `delete_email`, `clear_inbox`, `send_test_email`.
- SMS tools: `list_sms`, `get_sms`, `wait_for_sms`, `extract_sms_signals`, `delete_sms`, `clear_sms_inbox`, `send_test_sms`.
See `crates/mcp/src/main.rs` for the tool schemas — it's a hand-rolled JSON-RPC/MCP
server (no SDK dependency) so the schemas there are the source of truth.

Runnable end-to-end example: `examples/mcp_e2e_demo.py` spawns `pinemail-mcp` and
drives the exact flow above (send → wait → extract → cleanup) over stdio:
```bash
cargo build --release -p pinemail-mcp
PINEMAIL_URL=http://127.0.0.1:8025 python3 examples/mcp_e2e_demo.py target/release/pinemail-mcp
```

Example client config:
```json
{
  "mcpServers": {
    "pinemail": {
      "command": "pinemail-mcp",
      "env": { "PINEMAIL_URL": "http://localhost:8025" }
    }
  }
}
```

