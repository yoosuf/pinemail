# Pine Mail 🌲📬

**A tiny, single-binary SMTP mail catcher for development — built for AI agents.**

Like Mailtrap or Mailpit, but written in Rust (~15MB image, no JVM/Node runtime),
and designed so that AI coding agents (Claude, Copilot, Cursor, e2e test suites) can
**discover, wait for, and extract data from captured emails** via a REST API or an
MCP server — no more regex-scraping raw SMTP dumps to find a signup OTP or magic link.

```bash
docker run -d --name pinemail -p 1025:1025 -p 8025:8025 -v pinemail-data:/data yoosuf/pinemail:latest
```

Point your app's SMTP client at `localhost:1025`, open the inbox at
`http://localhost:8025` — done. No SMTP relaying, no external network access, no
accounts, no cloud. Everything stays on your machine.

---

## Why Pine Mail?

| | Pine Mail | Mailhog | Mailpit | Mailtrap (SaaS) |
|---|---|---|---|---|
| Single static binary | ✅ Rust | ❌ Go+deps | ✅ Go | ❌ cloud only |
| REST API to wait/extract signals | ✅ built-in | ❌ | partial | ❌ |
| MCP server for AI agents | ✅ | ❌ | ❌ | ❌ |
| Runs fully offline / local | ✅ | ✅ | ✅ | ❌ |
| Bulk actions + pagination | ✅ | ❌ | ✅ | ✅ |
| Free & open source | ✅ | ✅ | ✅ | ❌ |

## Built for agentic development

The killer feature: your AI agent (or e2e test) doesn't have to guess when an email
arrives or hand-write parsing logic.

```bash
# 1. long-poll for the next matching email (up to 60s), filtered by to/from/subject
curl "http://localhost:8025/api/wait?to=user@test.com&subject=Verify&since=<ts>&timeout_ms=15000"

# 2. pull OTP codes / magic links out of the body automatically
curl "http://localhost:8025/api/messages/<id>/extract"
# -> { "codes": ["482913"], "links": ["https://app.test/verify?token=..."] }
```

Or plug the bundled `pinemail-mcp` stdio server straight into Claude Desktop, Copilot,
or Cursor and give your agent tools: `list_emails`, `get_email`, `wait_for_email`,
`extract_signals`, `delete_email`, `clear_inbox`, `send_test_email`.

## Features

- SMTP catcher on port `1025` — no auth, no relaying, mail never leaves your machine.
- Web UI + REST API on port `8025` with live updates over WebSockets.
- View HTML/plain-text bodies, raw headers, download attachments or raw `.eml`.
- Search, mark read, delete, bulk select — paginated so huge inboxes stay snappy.
- SQLite storage with automatic pruning past `MAX_MESSAGES`.
- Multi-arch image (`linux/amd64` + `linux/arm64`), no external runtime dependencies.

## Quick start

```bash
docker run -d --name pinemail \
  -p 1025:1025 -p 8025:8025 \
  -v pinemail-data:/data \
  yoosuf/pinemail:latest
```

Or with Compose:

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

Run the MCP server against it (for Claude/Copilot/Cursor):

```bash
docker run --rm -i -e PINEMAIL_URL=http://host.docker.internal:8025 \
  --entrypoint /usr/local/bin/pinemail-mcp yoosuf/pinemail:latest
```

## Configuration

| Variable        | Default              | Description                                   |
|-----------------|----------------------|------------------------------------------------|
| `SMTP_PORT`     | `1025`               | Port the SMTP listener binds to                |
| `HTTP_PORT`     | `8025`               | Port the web UI / API binds to                 |
| `BIND_ADDR`     | `0.0.0.0`            | Bind address for both servers                  |
| `DB_PATH`       | `/data/pinemail.db`  | SQLite file path (`:memory:` for ephemeral)    |
| `MAX_MESSAGES`  | `1000`               | Oldest messages pruned past this (`0`=unlimited)|
| `SMTP_HOSTNAME` | `pinemail`           | Hostname advertised in the SMTP greeting       |

## Links

- Source & full docs: https://github.com/yoosuf/pinemail
- Agent integration guide: https://github.com/yoosuf/pinemail/blob/main/AGENTS.md
- Issues & feature requests: https://github.com/yoosuf/pinemail/issues

If Pine Mail saves you time, a ⭐ on GitHub helps a lot!

---

Built by [Yoosuf](https://yoosuf.me/), who also offers [fractional CTO services](https://yoosuf.me/services/).
