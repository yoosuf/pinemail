# Pine Mail 🌲📬

**A tiny, single-binary SMTP & SMS catcher for development — built for AI agents.**

Like Mailtrap or Mailpit, but written in Rust (~15MB image, no JVM/Node runtime), capturing both **SMTP emails** and **SMS messages** (via JSON or Twilio webhooks), and designed so that AI coding agents (Claude, Copilot, Cursor, e2e test suites) can **discover, wait for, and extract data from captured emails & SMS** via a REST API or an MCP server — no more regex-scraping raw logs or polling databases to find a signup OTP or magic link.

```bash
docker run -d --name pinemail -p 1025:1025 -p 8025:8025 -v pinemail-data:/data yoosuf/pinemail:latest
```

Point your app's SMTP client at `localhost:1025` or SMS webhook at `http://localhost:8025/api/sms/webhook`, open the inbox at `http://localhost:8025` — done. No external network access, no accounts, no cloud. Everything stays local on your machine.

---

## Why Pine Mail?

| Feature | Pine Mail | Mailhog | Mailpit | Mailtrap (SaaS) |
|---|---|---|---|---|
| Single static binary | ✅ Rust | ❌ Go+deps | ✅ Go | ❌ cloud only |
| Dual Email & SMS catcher | ✅ built-in | ❌ | ❌ | partial |
| Long-polling wait API | ✅ built-in | ❌ | partial | ❌ |
| Auto signal extraction (OTP/Links) | ✅ built-in | ❌ | ❌ | ❌ |
| Litmus-style email analysis | ✅ built-in | ❌ | ❌ | ❌ |
| MCP server for AI agents | ✅ (14 tools) | ❌ | ❌ | ❌ |
| Twilio webhook ingestion | ✅ built-in | ❌ | ❌ | ❌ |
| Free & open source | ✅ | ✅ | ✅ | ❌ |

---

## Built for Agentic Development & E2E Testing

Your AI agent (or automated test runner) doesn't need to sleep or write fragile regex scrapers.

### Email Flow
```bash
# 1. Long-poll server-side for matching email (up to 60s)
curl "http://localhost:8025/api/wait?to=user@test.com&subject=Verify&since=<ts>&timeout_ms=15000"

# 2. Extract verification OTP codes / magic links automatically
curl "http://localhost:8025/api/messages/<MESSAGE_ID>/extract"
# -> { "codes": ["482913"], "links": ["https://app.test/verify?token=..."] }

# 3. Litmus-style compatibility & spam analysis
curl "http://localhost:8025/api/messages/<MESSAGE_ID>/analysis"
```

### SMS Flow & Twilio Webhook
```bash
# 1. Ingest SMS via Twilio webhook endpoint
curl -X POST "http://localhost:8025/api/sms/webhook" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "From=%2B15550199&To=%2B15550100&Body=Your+OTP+is+839201"

# 2. Long-poll for SMS arrival
curl "http://localhost:8025/api/sms/wait?to=+15550100&since=<ts>"

# 3. Extract codes/links from SMS
curl "http://localhost:8025/api/sms/<SMS_ID>/extract"
# -> { "codes": ["839201"], "links": [] }
```

Or plug the bundled `pinemail-mcp` stdio server straight into Claude Desktop, Copilot, or Cursor to give your AI agent 14 built-in tools (`list_emails`, `get_email`, `wait_for_email`, `extract_signals`, `delete_email`, `clear_inbox`, `send_test_email`, `list_sms`, `get_sms`, `wait_for_sms`, `extract_sms_signals`, `send_test_sms`, `delete_sms`, `clear_sms_inbox`).

---

## Features

- **SMTP Catcher (`1025`)**: dead-end listener, no relaying, mail never leaves your machine.
- **SMS & Webhook Ingestion (`8025`)**: accepts standard JSON and Twilio form-urlencoded webhooks.
- **Dual Web UI & REST API (`8025`)**: real-time WebSocket updates for both Emails and SMS.
- **HTML / Plain Text Inspection**: view raw headers, HTML, plain text, and download attachments or raw `.eml`.
- **Litmus-Style Analysis**: checks DOCTYPE, layout tables, inline CSS, web fonts, background images, viewport, image alt text, size limits (>102KB Gmail threshold), and heuristic spam score.
- **Search, Pagination & Bulk Operations**: lazily-loaded grid (50 items/page) keeping huge inboxes fast.
- **SQLite Storage**: automatic FIFO pruning when store exceeds `MAX_MESSAGES`.
- **Multi-Arch Docker Image**: `linux/amd64` and `linux/arm64`.

---

## Quick Start

```bash
docker run -d --name pinemail \
  -p 1025:1025 -p 8025:8025 \
  -v pinemail-data:/data \
  yoosuf/pinemail:latest
```

Docker Compose:

```yaml
services:
  pinemail:
    image: yoosuf/pinemail:latest
    ports:
      - "1025:1025"
      - "8025:8025"
    volumes:
      - pinemail-data:/data
volumes:
  pinemail-data:
```

Run MCP Server against running container:

```bash
docker run --rm -i -e PINEMAIL_URL=http://host.docker.internal:8025 \
  --entrypoint /usr/local/bin/pinemail-mcp yoosuf/pinemail:latest
```

### Alternative Installation Methods

Prefer native host binaries without Docker?
- **Homebrew (macOS & Linux)**: `brew tap yoosuf/tap && brew install pinemail` (or `brew install yoosuf/tap/pinemail`)
- **POSIX Shell Installer**: `curl -fsSL https://raw.githubusercontent.com/yoosuf/pinemail/main/install.sh | sh`
- **Windows PowerShell**: `iwr -useb https://raw.githubusercontent.com/yoosuf/pinemail/main/install.ps1 | iex`
- **Native Packages**: `.deb` (Debian/Ubuntu), `.rpm` (Fedora/RHEL), Arch Linux (AUR `pinemail-bin`), Scoop, Winget, and Chocolatey.

---

## Configuration

| Variable | Default | Description |
|---|---|---|
| `SMTP_PORT` | `1025` | Port the SMTP listener binds to |
| `HTTP_PORT` | `8025` | Port the web UI / REST API binds to |
| `BIND_ADDR` | `0.0.0.0` | Network bind address |
| `DB_PATH` | `pinemail.db` (`/data/pinemail.db` in Docker) | SQLite database path (`:memory:` for in-memory DB) |
| `MAX_MESSAGES` | `1000` | Max messages/SMS stored before FIFO pruning (`0` = unlimited) |
| `SMTP_HOSTNAME` | `pinemail` | Banner hostname for SMTP listener |

---

## Links

- **Repository & Docs**: https://github.com/yoosuf/pinemail
- **System Architecture**: https://github.com/yoosuf/pinemail/blob/main/ARCHITECTURE.md
- **Agent Integration Guide**: https://github.com/yoosuf/pinemail/blob/main/AGENTS.md
- **Issue Tracker**: https://github.com/yoosuf/pinemail/issues

Built by [Yoosuf](https://yoosuf.me/), who also offers [fractional CTO services](https://yoosuf.me/services/).
