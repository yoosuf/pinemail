# Pine Mail 🌲📬

A tiny, single-binary **SMTP & SMS catcher** for development environments — like Mailtrap or Mailpit, but written in Rust with a minimal footprint (~15MB image), structured as a monorepo, and built for agentic development: AI agents (and e2e tests) can discover, wait for, and extract data from captured emails and SMS messages via a REST API or an MCP server.

**Tags:** `mail` • `SMTP` • `SMS` • `mail-catcher` • `sms-catcher` • `testing` • `e2e` • `agents` • `MCP` • `Docker` • `Rust` • `email` • `development`

---

## Monorepo Layout

```
crates/core/    pinemail-core   — shared SQLite store, MIME parsing, HTML/spam analysis, signal extraction
crates/server/  pinemail        — SMTP (1025) + HTTP API/UI (8025); what you deploy
crates/mcp/     pinemail-mcp    — MCP stdio server exposing emails & SMS to AI agents
apps/web/                       — React + Vite + TS frontend embedded into `pinemail`
```

For full system architecture, sequence diagrams, database schemas, and design details, see [ARCHITECTURE.md](ARCHITECTURE.md).  
For runtime integration details for AI agents and test suites, see [AGENTS.md](AGENTS.md).

---

## Key Features

- **SMTP Email Catcher (`:1025`)**: dead-end local SMTP listener (no auth, no relaying, no external network calls).
- **SMS Catcher & Twilio Webhook Support (`:8025`)**: ingest SMS via standard JSON or Twilio webhooks (`POST /api/sms` and `POST /api/sms/webhook`).
- **Web UI & REST API (`:8025`)**: dual-tab React interface for Emails & SMS with live updates over WebSockets.
- **Rich Message Inspection**: view HTML/plain-text bodies, raw headers, download attachments or raw `.eml` files.
- **Litmus-Style Email Analysis**: `GET /api/messages/:id/analysis` checks 11 HTML email-client compatibility factors (DOCTYPE, tables, inline CSS, fonts, image alt, size clipping) and provides a SpamAssassin-style heuristic spam score.
- **Search, Pagination & Bulk Actions**: multi-select grid with bulk mark read/unread, bulk delete, and paginated lazy-loading (50 items per page).
- **Agentic Long-Polling**: `GET /api/wait` and `GET /api/sms/wait` long-poll server-side for incoming emails or SMS matching filters (`to`, `from`, `subject`, `body`, `since`).
- **Signal Extraction Engine**: `GET /api/messages/:id/extract` and `GET /api/sms/:id/extract` automatically pull OTP codes (4-8 digits) and magic links out of captured messages.
- **14 MCP Agent Tools (`pinemail-mcp`)**: built-in Model Context Protocol stdio server exposing email & SMS discovery tools directly to Claude Desktop, Copilot, Cursor, and custom agents.
- **SQLite Storage**: persistent SQLite storage (`/data/pinemail.db` or `:memory:`) with automatic FIFO pruning past `MAX_MESSAGES`.
- **Zero External Runtime Dependencies**: single binary with embedded frontend built via `rust-embed`.

---

## Installation & Distribution Methods

Pine Mail provides official distribution packages and single static binaries for **macOS**, **Linux**, and **Windows**.

### 🍺 Homebrew (macOS & Linux)

Install Pine Mail (both `pinemail` server and `pinemail-mcp` agent tool) via Homebrew:

```bash
brew tap yoosuf/pinemail
brew install pinemail
```

**Run as a background service (macOS):**
```bash
brew services start pinemail
```

---

### ⚡ Automated One-Liner Installers

Auto-detects OS and CPU architecture, downloads the latest binary release, and places executables in PATH.

**macOS & Linux (POSIX Shell):**
```bash
curl -fsSL https://raw.githubusercontent.com/yoosuf/pinemail/main/install.sh | sh
```

**Windows (PowerShell):**
```powershell
iwr -useb https://raw.githubusercontent.com/yoosuf/pinemail/main/install.ps1 | iex
```

---

### 🐧 Linux Native Packages

- **Debian / Ubuntu (`.deb`)**:
  ```bash
  curl -LO https://github.com/yoosuf/pinemail/releases/latest/download/pinemail_amd64.deb
  sudo dpkg -i pinemail_amd64.deb
  ```
- **Fedora / RHEL / CentOS (`.rpm`)**:
  ```bash
  sudo rpm -i https://github.com/yoosuf/pinemail/releases/latest/download/pinemail.x86_64.rpm
  ```
- **Arch Linux (AUR)**:
  ```bash
  yay -S pinemail-bin
  ```

---

### 🪟 Windows Package Managers

- **Scoop**:
  ```powershell
  scoop bucket add pinemail https://github.com/yoosuf/scoop-bucket
  scoop install pinemail
  ```
- **Winget (Windows Package Manager)**:
  ```cmd
  winget install PineMail.PineMail
  ```
- **Chocolatey**:
  ```cmd
  choco install pinemail
  ```

---

### 📦 Pre-Compiled GitHub Release Binaries

Download standalone pre-built binaries from [GitHub Releases](https://github.com/yoosuf/pinemail/releases/latest):

| Operating System | Architecture | Package File |
|---|---|---|
| **macOS** | Apple Silicon (`aarch64`) | `pinemail-v*-aarch64-apple-darwin.tar.gz` |
| **macOS** | Intel (`x86_64`) | `pinemail-v*-x86_64-apple-darwin.tar.gz` |
| **Linux** | x86_64 | `pinemail-v*-x86_64-unknown-linux-gnu.tar.gz` |
| **Linux** | ARM64 (`aarch64`) | `pinemail-v*-aarch64-unknown-linux-gnu.tar.gz` |
| **Windows** | x86_64 | `pinemail-v*-x86_64-pc-windows-msvc.zip` |

---

### 🦀 Cargo (Rust Workspace)

Install directly via `cargo`:

```bash
cargo install --git https://github.com/yoosuf/pinemail pinemail-server pinemail-mcp
```

---

### 🐳 Docker & Docker Compose

Pull the published multi-arch image (`linux/amd64` + `linux/arm64`) from Docker Hub:

```bash
docker run -d --name pinemail -p 1025:1025 -p 8025:8025 -v pinemail-data:/data yoosuf/pinemail:latest
```

Or run via Docker Compose:

```bash
docker compose up --build
```

To run the MCP server against it:

```bash
docker compose --profile mcp run --rm mcp
```

**Docker Hub:** [`yoosuf/pinemail`](https://hub.docker.com/r/yoosuf/pinemail) — tags `latest` and `0.1.0`.

---

## Agent Integration Examples

### REST API (Long-Polling + Signal Extraction)

```bash
# 1. Long-poll for a fresh email matching criteria (up to 10s default, max 60s)
curl "http://localhost:8025/api/wait?to=user@example.com&subject=Verify&since=2026-09-04T09:00:00Z"

# 2. Extract OTP codes and links from the received email
curl "http://localhost:8025/api/messages/<MESSAGE_ID>/extract"
# Response: { "codes": ["482913"], "links": ["https://app.test/verify?token=..."] }

# 3. Analyze HTML compatibility & spam score
curl "http://localhost:8025/api/messages/<MESSAGE_ID>/analysis"

# 4. Long-poll for a fresh SMS message
curl "http://localhost:8025/api/sms/wait?to=+15550100&since=2026-09-04T09:00:00Z"

# 5. Extract OTP codes from the received SMS
curl "http://localhost:8025/api/sms/<SMS_ID>/extract"
# Response: { "codes": ["940182"], "links": [] }
```

### Twilio SMS Ingestion Webhook

Point your application or local webhook relay to:
```http
POST http://localhost:8025/api/sms/webhook
Content-Type: application/x-www-form-urlencoded

From=%2B15550199&To=%2B15550100&Body=Your+verification+code+is+839201
```

---

## Configuration (Environment Variables)

| Variable | Default | Description |
|---|---|---|
| `SMTP_PORT` | `1025` | Port the SMTP listener binds to |
| `HTTP_PORT` | `8025` | Port the web UI / REST API binds to |
| `BIND_ADDR` | `0.0.0.0` | Bind address for both listeners |
| `DB_PATH` | `pinemail.db` (`/data/pinemail.db` in Docker) | SQLite database file path (`:memory:` for ephemeral in-memory DB) |
| `MAX_MESSAGES` | `1000` | Oldest messages/SMS are pruned past this count (`0` = unlimited) |
| `SMTP_HOSTNAME` | `pinemail` | Hostname advertised in the SMTP banner |
| `PINEMAIL_URL` | `http://127.0.0.1:8025` | (`pinemail-mcp` only) Base HTTP URL of the running server |

---

## Local Development

```bash
# Terminal 1 — Frontend hot reload (Vite dev server proxied to Rust API)
cd apps/web && npm install && npm run dev

# Terminal 2 — Backend server (SMTP on :1025, API on :8025)
cargo run -p pinemail-server
```

## Building Release Binaries

```bash
cd apps/web && npm install && npm run build && cd ..
cargo build --release --workspace
```

The frontend static assets must be built to `apps/web/dist` before building `pinemail-server`, as they are embedded directly into the binary using `rust-embed`.

---

## Author

Built by [Yoosuf](https://yoosuf.me/), who also offers [fractional CTO services](https://yoosuf.me/services/).
