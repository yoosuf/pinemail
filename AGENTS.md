# AGENTS.md

Guide for AI coding agents (and human engineers) developing within this repository, as well as AI agents that consume Pine Mail *at runtime* during agentic development and automated e2e testing.

For system internals, memory limits, and sequence diagrams, refer to [ARCHITECTURE.md](ARCHITECTURE.md).

---

## Monorepo Layout & Dependency Model

```
pine-mail/
├── crates/
│   ├── core/     pinemail-core   — shared lib: SQLite store, MIME parsing, HTML/spam analysis, signal extraction
│   ├── server/   pinemail        — SMTP (1025) + HTTP API/UI (8025), main server binary
│   └── mcp/      pinemail-mcp    — MCP stdio server wrapper around the REST API
├── apps/
│   └── web/                       — React + Vite + TS frontend embedded into `pinemail`
├── Cargo.toml                      — workspace root
├── Dockerfile / docker-compose.yml
└── README.md
```

> **Architecture Principle**: `server` and `mcp` both depend on `core` for shared types (`MessageSummary`, `MessageDetail`, `SmsMessage`, `ExtractedSignals`, etc.). `mcp` talks to `server` strictly over HTTP via `PINEMAIL_URL` rather than accessing the SQLite database directly. This ensures the two binaries can run on separate hosts or containers without database file locking issues.

---

## Build & Dev Commands

```bash
# Workspace check & builds
cargo check --workspace
cargo build --workspace          # Debug builds of pinemail + pinemail-mcp
cargo build --release --workspace

# Frontend build (must precede cargo build if embedding updated web UI)
cd apps/web && npm install && npm run build

# Run locally
cargo run -p pinemail-server     # http://localhost:8025, smtp on :1025
cargo run -p pinemail-mcp        # reads PINEMAIL_URL, talks JSON-RPC over stdio

# Install pre-built binaries (macOS, Linux, Windows)
# Homebrew: brew tap yoosuf/pinemail && brew install pinemail
# POSIX Shell: curl -fsSL https://raw.githubusercontent.com/yoosuf/pinemail/main/install.sh | sh
# Windows PowerShell: iwr -useb https://raw.githubusercontent.com/yoosuf/pinemail/main/install.ps1 | iex

# Docker shortcuts
docker compose up --build                 # Server + SMTP listener
docker compose --profile mcp run --rm mcp # One-off MCP stdio session against running server
```

---

## Adding Features Touch Storage or Logic

Place core database operations, MIME parsing, models, or regex logic inside `crates/core` (`store.rs` / `mail.rs` / `models.rs` / `analysis.rs`). Expose the feature through:
1. `crates/server/src/api/` (REST / HTTP endpoints)
2. `crates/mcp/src/main.rs` (MCP tools for AI agents)

Never duplicate SQL or parsing logic across `server` or `mcp`.

---

## Runtime API for Agentic Email & SMS Discovery

Agents driving end-to-end tests (e.g. signup flows, password resets, SMS 2FA logins, magic-link verification) consume Pine Mail via **REST API** or **MCP Server**.

### 1. Direct REST API Reference

#### Email Endpoints
- `GET /api/messages?search=&limit=50&offset=0` — List captured emails (newest first).
- `GET /api/messages/:id` — Fetch full email details (text/html body, headers, attachment metadata).
- `GET /api/messages/:id/raw` — Download raw RFC 822 MIME source (.eml).
- `GET /api/messages/:id/html` — Render HTML body.
- `GET /api/messages/:id/attachments/:index` — Download attachment file by index.
- `GET /api/messages/:id/extract` — Returns `{ codes: string[], links: string[] }` extracted via regex (4-8 digit OTPs, HTTP/HTTPS URLs).
- `GET /api/messages/:id/analysis` — Returns Litmus-style HTML email-client compatibility checks and heuristic spam score (`{ html: HtmlAnalysis, spam: SpamAnalysis }`).
- `GET /api/wait?to=&from=&subject=&since=&timeout_ms=` — **Server-side long-polling wait**. Blocks up to `timeout_ms` (default 10s, max 60s) until a matching email arrives, returning `MessageDetail`.
- `PATCH /api/messages/:id/read` — Toggle read state (`{"read": true}`).
- `DELETE /api/messages/:id` — Delete single email.
- `POST /api/messages/bulk-delete` — Bulk delete emails (`{"ids": ["id1", "id2"]}`).
- `PATCH /api/messages/bulk-read` — Bulk mark read state (`{"ids": ["id1", "id2"], "read": true}`).
- `DELETE /api/messages` — Clear all emails.
- `POST /api/test-email` — Inject a synthetic test email (`{"to": "user@example.com"}`).

#### SMS Endpoints
- `GET /api/sms?search=&limit=50&offset=0` — List captured SMS messages.
- `GET /api/sms/:id` — Fetch single SMS message by ID.
- `POST /api/sms` — Ingest SMS via JSON (`{"from": "+1555...", "to": "+1800...", "body": "..."}`).
- `POST /api/sms/webhook` — Ingest SMS via Twilio form-urlencoded or JSON webhooks.
- `GET /api/sms/wait?to=&from=&body=&since=&timeout_ms=` — **Server-side long-polling wait for SMS**. Blocks until a matching SMS arrives.
- `GET /api/sms/:id/extract` — Returns `{ codes: string[], links: string[] }` extracted from the SMS body.
- `PATCH /api/sms/:id/read` — Toggle read state (`{"read": true}`).
- `DELETE /api/sms/:id` — Delete single SMS.
- `POST /api/sms/bulk-delete` — Bulk delete SMS (`{"ids": ["id1", "id2"]}`).
- `PATCH /api/sms/bulk-read` — Bulk mark read state (`{"ids": ["id1", "id2"], "read": true}`).
- `DELETE /api/sms` — Clear all SMS messages.
- `POST /api/test-sms` — Inject a synthetic test SMS message (`{"to": "+1555...", "from": "+1800...", "body": "..."}`).

#### System Endpoints
- `GET /api/config` — Returns `{ version: string, smtp_port: number, http_port: number }`.
- `GET /api/events` — WebSocket stream (`ws://localhost:8025/api/events`) for real-time events.

---

### Typical Agent E2E Flow

```
1. Record timestamp: `since = current_iso_8601_timestamp()` BEFORE triggering action
2. Trigger application action (e.g. POST /api/signup or POST /api/request-otp)
3. Call GET /api/wait or GET /api/sms/wait with since=<step 1>
4. Call GET /api/messages/{id}/extract or GET /api/sms/{id}/extract -> grab codes[0] or links[0]
5. Submit code or navigate link to complete automated test flow
6. Optionally clean up with DELETE /api/messages/{id} or DELETE /api/sms/{id}
```

> [!CAUTION]
> **Gotcha: Timestamp `since` parameter**: `since` defaults to "now" *at the moment the wait endpoint is called*. If your test triggers the action first and calls `/api/wait` second, an email/SMS received in that microsecond gap will have `received_at < since` and be filtered out. Always capture `since` timestamp **prior** to triggering the sending action.

---

### 2. MCP Server (`pinemail-mcp`)

Point your MCP client (Claude Desktop, Copilot, Cursor) at `pinemail-mcp` (stdio transport) with `PINEMAIL_URL` set to the running server.

#### Exposed MCP Tools (14 Tools)

**Email Tools:**
- `list_emails`: `{ search?: string, limit?: number, offset?: number }`
- `get_email`: `{ id: string }`
- `wait_for_email`: `{ to?: string, from?: string, subject?: string, since_ms?: number, timeout_ms?: number }`
- `extract_signals`: `{ id: string }`
- `send_test_email`: `{ to?: string }`
- `delete_email`: `{ id: string }`
- `clear_inbox`: `{}`

**SMS Tools:**
- `list_sms`: `{ search?: string, limit?: number, offset?: number }`
- `get_sms`: `{ id: string }`
- `wait_for_sms`: `{ to?: string, from?: string, body?: string, since_ms?: number, timeout_ms?: number }`
- `extract_sms_signals`: `{ id: string }`
- `send_test_sms`: `{ to?: string, from?: string, body?: string }`
- `delete_sms`: `{ id: string }`
- `clear_sms_inbox`: `{}`

#### Runnable E2E Demo Script

`examples/mcp_e2e_demo.py` demonstrates launching `pinemail-mcp` over stdio and running a complete test sequence:

```bash
cargo build --release -p pinemail-mcp
PINEMAIL_URL=http://127.0.0.1:8025 python3 examples/mcp_e2e_demo.py target/release/pinemail-mcp
```

#### Client Configuration Snippet

```json
{
  "mcpServers": {
    "pinemail": {
      "command": "pinemail-mcp",
      "env": {
        "PINEMAIL_URL": "http://localhost:8025"
      }
    }
  }
}
```
