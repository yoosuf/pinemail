use std::sync::Mutex;

use anyhow::{Context, Result};
use rusqlite::{params, Connection, OptionalExtension};

use crate::models::MessageSummary;

pub struct Store {
    conn: Mutex<Connection>,
    max_messages: u64,
}

pub struct NewMessage {
    pub id: String,
    pub from: String,
    pub to: Vec<String>,
    pub subject: String,
    pub size: i64,
    pub raw: Vec<u8>,
}

impl Store {
    pub fn new(db_path: &str, max_messages: u64) -> Result<Self> {
        let conn = Connection::open(db_path).context("failed to open database")?;
        conn.execute_batch(
            "PRAGMA journal_mode=WAL;
             PRAGMA synchronous=NORMAL;
             CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                from_addr TEXT NOT NULL,
                to_addrs TEXT NOT NULL,
                subject TEXT NOT NULL,
                size INTEGER NOT NULL,
                received_at TEXT NOT NULL,
                read INTEGER NOT NULL DEFAULT 0,
                raw BLOB NOT NULL
             );
             CREATE INDEX IF NOT EXISTS idx_messages_received_at ON messages(received_at);",
        )?;
        Ok(Self {
            conn: Mutex::new(conn),
            max_messages,
        })
    }

    pub fn insert(&self, msg: NewMessage) -> Result<MessageSummary> {
        let conn = self.conn.lock().unwrap();
        let received_at = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
        let to_json = serde_json::to_string(&msg.to)?;
        conn.execute(
            "INSERT INTO messages (id, from_addr, to_addrs, subject, size, received_at, read, raw)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, ?7)",
            params![msg.id, msg.from, to_json, msg.subject, msg.size, received_at, msg.raw],
        )?;

        if self.max_messages > 0 {
            conn.execute(
                "DELETE FROM messages WHERE id IN (
                    SELECT id FROM messages ORDER BY received_at DESC LIMIT -1 OFFSET ?1
                )",
                params![self.max_messages as i64],
            )?;
        }

        let (has_html, has_attachments) = crate::mail::body_flags(&msg.raw);

        Ok(MessageSummary {
            id: msg.id,
            from: msg.from,
            to: msg.to,
            subject: msg.subject,
            size: msg.size,
            received_at,
            read: false,
            has_html,
            has_attachments,
        })
    }

    pub fn list(&self, search: Option<&str>, limit: i64, offset: i64) -> Result<(Vec<MessageSummary>, i64)> {
        let conn = self.conn.lock().unwrap();
        let like = search.map(|s| format!("%{}%", s));

        let total: i64 = if let Some(ref pattern) = like {
            conn.query_row(
                "SELECT COUNT(*) FROM messages WHERE from_addr LIKE ?1 OR to_addrs LIKE ?1 OR subject LIKE ?1",
                params![pattern],
                |r| r.get(0),
            )?
        } else {
            conn.query_row("SELECT COUNT(*) FROM messages", [], |r| r.get(0))?
        };

        let mut stmt = if like.is_some() {
            conn.prepare(
                "SELECT id, from_addr, to_addrs, subject, size, received_at, read, raw
                 FROM messages
                 WHERE from_addr LIKE ?1 OR to_addrs LIKE ?1 OR subject LIKE ?1
                 ORDER BY received_at DESC LIMIT ?2 OFFSET ?3",
            )?
        } else {
            conn.prepare(
                "SELECT id, from_addr, to_addrs, subject, size, received_at, read, raw
                 FROM messages ORDER BY received_at DESC LIMIT ?2 OFFSET ?3",
            )?
        };

        let dummy = "%".to_string();
        let pattern = like.as_ref().unwrap_or(&dummy);
        let rows = stmt.query_map(params![pattern, limit, offset], |row| {
            let to_json: String = row.get(2)?;
            let raw: Vec<u8> = row.get(7)?;
            Ok((
                MessageSummary {
                    id: row.get(0)?,
                    from: row.get(1)?,
                    to: serde_json::from_str(&to_json).unwrap_or_default(),
                    subject: row.get(3)?,
                    size: row.get(4)?,
                    received_at: row.get(5)?,
                    read: row.get::<_, i64>(6)? != 0,
                    has_html: false,
                    has_attachments: false,
                },
                raw,
            ))
        })?;

        let mut messages = Vec::new();
        for row in rows {
            let (mut summary, raw) = row?;
            let (has_html, has_attachments) = crate::mail::body_flags(&raw);
            summary.has_html = has_html;
            summary.has_attachments = has_attachments;
            messages.push(summary);
        }

        Ok((messages, total))
    }

    /// Finds the oldest message matching the given (optional, AND-combined) filters.
    /// Used by the `/api/wait` long-poll endpoint so agents/tests can wait for a fresh email.
    pub fn find_matching(
        &self,
        to: Option<&str>,
        from: Option<&str>,
        subject: Option<&str>,
        since: Option<&str>,
    ) -> Result<Option<MessageSummary>> {
        let conn = self.conn.lock().unwrap();

        let mut clauses = Vec::new();
        let mut values: Vec<String> = Vec::new();
        if let Some(to) = to {
            clauses.push("to_addrs LIKE ?");
            values.push(format!("%{to}%"));
        }
        if let Some(from) = from {
            clauses.push("from_addr LIKE ?");
            values.push(format!("%{from}%"));
        }
        if let Some(subject) = subject {
            clauses.push("subject LIKE ?");
            values.push(format!("%{subject}%"));
        }
        if let Some(since) = since {
            clauses.push("received_at > ?");
            values.push(since.to_string());
        }

        let where_clause = if clauses.is_empty() {
            String::new()
        } else {
            format!("WHERE {}", clauses.join(" AND "))
        };
        let sql = format!(
            "SELECT id, from_addr, to_addrs, subject, size, received_at, read, raw
             FROM messages {where_clause} ORDER BY received_at ASC LIMIT 1"
        );

        let mut stmt = conn.prepare(&sql)?;
        let params: Vec<&dyn rusqlite::ToSql> = values.iter().map(|v| v as &dyn rusqlite::ToSql).collect();
        let row = stmt
            .query_row(params.as_slice(), |row| {
                let to_json: String = row.get(2)?;
                let raw: Vec<u8> = row.get(7)?;
                Ok((
                    MessageSummary {
                        id: row.get(0)?,
                        from: row.get(1)?,
                        to: serde_json::from_str(&to_json).unwrap_or_default(),
                        subject: row.get(3)?,
                        size: row.get(4)?,
                        received_at: row.get(5)?,
                        read: row.get::<_, i64>(6)? != 0,
                        has_html: false,
                        has_attachments: false,
                    },
                    raw,
                ))
            })
            .optional()?;

        Ok(row.map(|(mut summary, raw)| {
            let (has_html, has_attachments) = crate::mail::body_flags(&raw);
            summary.has_html = has_html;
            summary.has_attachments = has_attachments;
            summary
        }))
    }

    pub fn get_raw(&self, id: &str) -> Result<Option<Vec<u8>>> {
        let conn = self.conn.lock().unwrap();
        let raw: Option<Vec<u8>> = conn
            .query_row("SELECT raw FROM messages WHERE id = ?1", params![id], |r| r.get(0))
            .optional()?;
        Ok(raw)
    }

    pub fn get_summary(&self, id: &str) -> Result<Option<MessageSummary>> {
        let conn = self.conn.lock().unwrap();
        let row: Option<(String, String, String, i64, String, i64, Vec<u8>)> = conn
            .query_row(
                "SELECT from_addr, to_addrs, subject, size, received_at, read, raw FROM messages WHERE id = ?1",
                params![id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?, r.get(6)?)),
            )
            .optional()?;
        Ok(row.map(|(from, to_json, subject, size, received_at, read, raw)| {
            let (has_html, has_attachments) = crate::mail::body_flags(&raw);
            MessageSummary {
                id: id.to_string(),
                from,
                to: serde_json::from_str(&to_json).unwrap_or_default(),
                subject,
                size,
                received_at,
                read: read != 0,
                has_html,
                has_attachments,
            }
        }))
    }

    pub fn mark_read(&self, id: &str, read: bool) -> Result<bool> {
        let conn = self.conn.lock().unwrap();
        let n = conn.execute(
            "UPDATE messages SET read = ?1 WHERE id = ?2",
            params![read as i64, id],
        )?;
        Ok(n > 0)
    }

    /// Bulk-marks read/unread. Capped at `BULK_LIMIT` ids per call so a single
    /// request can't blow past SQLite's bound-parameter limit or hold the lock too long.
    pub fn mark_read_many(&self, ids: &[String], read: bool) -> Result<usize> {
        let ids = &ids[..ids.len().min(BULK_LIMIT)];
        if ids.is_empty() {
            return Ok(0);
        }
        let conn = self.conn.lock().unwrap();
        let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let sql = format!("UPDATE messages SET read = ? WHERE id IN ({placeholders})");
        let read_i64: i64 = read as i64;
        let mut params: Vec<&dyn rusqlite::ToSql> = Vec::with_capacity(ids.len() + 1);
        params.push(&read_i64);
        params.extend(ids.iter().map(|id| id as &dyn rusqlite::ToSql));
        Ok(conn.execute(&sql, params.as_slice())?)
    }

    pub fn delete(&self, id: &str) -> Result<bool> {
        let conn = self.conn.lock().unwrap();
        let n = conn.execute("DELETE FROM messages WHERE id = ?1", params![id])?;
        Ok(n > 0)
    }

    /// Bulk-deletes. Capped at `BULK_LIMIT` ids per call for the same reason as `mark_read_many`.
    pub fn delete_many(&self, ids: &[String]) -> Result<usize> {
        let ids = &ids[..ids.len().min(BULK_LIMIT)];
        if ids.is_empty() {
            return Ok(0);
        }
        let conn = self.conn.lock().unwrap();
        let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let sql = format!("DELETE FROM messages WHERE id IN ({placeholders})");
        let params: Vec<&dyn rusqlite::ToSql> = ids.iter().map(|id| id as &dyn rusqlite::ToSql).collect();
        Ok(conn.execute(&sql, params.as_slice())?)
    }

    pub fn clear(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM messages", [])?;
        Ok(())
    }
}

/// Max ids accepted per bulk operation, regardless of what the client sends.
const BULK_LIMIT: usize = 1000;
