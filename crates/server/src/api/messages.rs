use std::sync::Arc;

use axum::extract::{Path, Query, State};
use axum::http::{header, StatusCode};
use axum::response::IntoResponse;
use axum::Json;
use tokio::sync::broadcast;

use pinemail_core::mail;
use pinemail_core::models::{BulkIdsBody, BulkReadBody, Event, ListQuery, MarkReadBody, MessageDetail, MessageList};
use pinemail_core::store::{NewMessage, Store};

use super::error::ApiError;

#[derive(Clone)]
pub struct AppState {
    pub store: Arc<Store>,
    pub tx: broadcast::Sender<Event>,
}

pub async fn list_messages(
    State(state): State<AppState>,
    Query(query): Query<ListQuery>,
) -> Result<Json<MessageList>, ApiError> {
    let limit = query.limit.unwrap_or(50).clamp(1, 500);
    let offset = query.offset.unwrap_or(0).max(0);

    let (messages, total) = state.store.list(query.search.as_deref(), limit, offset)?;
    Ok(Json(MessageList { messages, total }))
}

pub async fn clear_messages(State(state): State<AppState>) -> Result<StatusCode, ApiError> {
    state.store.clear()?;
    let _ = state.tx.send(Event::Cleared);
    Ok(StatusCode::NO_CONTENT)
}

pub async fn get_message(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<MessageDetail>, ApiError> {
    let summary = state.store.get_summary(&id)?.ok_or(ApiError::NotFound)?;
    let raw = state.store.get_raw(&id)?.ok_or(ApiError::NotFound)?;

    let detail = mail::parse_detail(&raw).ok_or(ApiError::UnprocessableEntity("could not parse message"))?;

    Ok(Json(MessageDetail {
        summary,
        text_body: detail.text_body,
        html_body: detail.html_body,
        headers: detail.headers,
        attachments: detail.attachments,
    }))
}

pub async fn delete_message(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<StatusCode, ApiError> {
    if state.store.delete(&id)? {
        let _ = state.tx.send(Event::Deleted { id });
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(ApiError::NotFound)
    }
}

pub async fn mark_read(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<MarkReadBody>,
) -> Result<StatusCode, ApiError> {
    if state.store.mark_read(&id, body.read)? {
        let _ = state.tx.send(Event::Read { id, read: body.read });
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(ApiError::NotFound)
    }
}

pub async fn bulk_delete(
    State(state): State<AppState>,
    Json(body): Json<BulkIdsBody>,
) -> Result<StatusCode, ApiError> {
    if body.ids.is_empty() {
        return Err(ApiError::BadRequest("ids list cannot be empty".to_string()));
    }
    state.store.delete_many(&body.ids)?;
    let _ = state.tx.send(Event::BulkDeleted { ids: body.ids });
    Ok(StatusCode::NO_CONTENT)
}

pub async fn bulk_mark_read(
    State(state): State<AppState>,
    Json(body): Json<BulkReadBody>,
) -> Result<StatusCode, ApiError> {
    if body.ids.is_empty() {
        return Err(ApiError::BadRequest("ids list cannot be empty".to_string()));
    }
    state.store.mark_read_many(&body.ids, body.read)?;
    let _ = state.tx.send(Event::BulkRead { ids: body.ids, read: body.read });
    Ok(StatusCode::NO_CONTENT)
}

pub async fn get_raw(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, ApiError> {
    let raw = state.store.get_raw(&id)?.ok_or(ApiError::NotFound)?;
    Ok((
        [
            (header::CONTENT_TYPE, "message/rfc822".to_string()),
            (
                header::CONTENT_DISPOSITION,
                format!("attachment; filename=\"{id}.eml\""),
            ),
        ],
        raw,
    ))
}

pub async fn get_html(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse, ApiError> {
    let raw = state.store.get_raw(&id)?.ok_or(ApiError::NotFound)?;
    let html = mail::parse_detail(&raw)
        .and_then(|d| d.html_body)
        .ok_or(ApiError::NotFound)?;
    Ok(([(header::CONTENT_TYPE, "text/html; charset=utf-8")], html))
}

pub async fn get_attachment(
    State(state): State<AppState>,
    Path((id, index)): Path<(String, usize)>,
) -> Result<impl IntoResponse, ApiError> {
    let raw = state.store.get_raw(&id)?.ok_or(ApiError::NotFound)?;
    let (bytes, content_type, filename) = mail::attachment_bytes(&raw, index).ok_or(ApiError::NotFound)?;
    Ok((
        [
            (header::CONTENT_TYPE, content_type),
            (
                header::CONTENT_DISPOSITION,
                format!("attachment; filename=\"{filename}\""),
            ),
        ],
        bytes,
    ))
}

/// Pulls likely OTP codes and links out of a message body — built for agents/tests
/// that need to grab a verification code or magic link without writing their own regex.
pub async fn get_extract(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<pinemail_core::mail::ExtractedSignals>, ApiError> {
    let raw = state.store.get_raw(&id)?.ok_or(ApiError::NotFound)?;
    let detail = mail::parse_detail(&raw).ok_or(ApiError::UnprocessableEntity("could not parse message"))?;
    let signals = mail::extract_signals(detail.text_body.as_deref(), detail.html_body.as_deref());
    Ok(Json(signals))
}

/// HTML email-client-compatibility checks + a heuristic spam score, so the UI can
/// show the same kind of report Litmus/mail-tester-style tools give — without
/// leaving the local dev loop.
pub async fn get_analysis(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let raw = state.store.get_raw(&id)?.ok_or(ApiError::NotFound)?;
    let detail = mail::parse_detail(&raw).ok_or(ApiError::UnprocessableEntity("could not parse message"))?;
    let subject = detail
        .headers
        .iter()
        .find(|h| h.name.eq_ignore_ascii_case("subject"))
        .map(|h| h.value.as_str())
        .unwrap_or("");

    let html = pinemail_core::analysis::analyze_html(detail.html_body.as_deref());
    let spam = pinemail_core::analysis::analyze_spam(
        subject,
        detail.text_body.as_deref(),
        detail.html_body.as_deref(),
        &detail.headers,
        &detail.attachments,
    );

    Ok(Json(serde_json::json!({ "html": html, "spam": spam })))
}

#[derive(serde::Deserialize, Default)]
pub struct SendTestEmailBody {
    pub to: Option<String>,
}

/// Synthesizes and "delivers" a test message, exactly like a real SMTP send would,
/// so the setup panel can offer a one-click way to confirm the catcher is working.
pub async fn send_test_email(
    State(state): State<AppState>,
    Json(body): Json<SendTestEmailBody>,
) -> Result<Json<pinemail_core::models::MessageSummary>, ApiError> {
    let to = body
        .to
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "you@example.com".to_string());
    let smtp_port: u16 = std::env::var("SMTP_PORT").ok().and_then(|v| v.parse().ok()).unwrap_or(1025);
    let from = "Pine Mail <no-reply@pinemail.local>".to_string();
    let subject = "✅ Test email from Pine Mail".to_string();
    let raw = build_test_email(&from, &to, &subject, smtp_port);

    let msg = NewMessage {
        id: uuid::Uuid::new_v4().to_string(),
        from,
        to: vec![to],
        subject,
        size: raw.len() as i64,
        raw,
    };

    let summary = state.store.insert(msg)?;
    let _ = state.tx.send(Event::New(summary.clone()));
    Ok(Json(summary))
}

fn build_test_email(from: &str, to: &str, subject: &str, smtp_port: u16) -> Vec<u8> {
    let boundary = "pinemail-test-boundary";
    let date = chrono::Utc::now().to_rfc2822();
    format!(
        "Date: {date}\r\n\
         From: {from}\r\n\
         To: {to}\r\n\
         Subject: {subject}\r\n\
         MIME-Version: 1.0\r\n\
         Content-Type: multipart/alternative; boundary=\"{boundary}\"\r\n\
         \r\n\
         --{boundary}\r\n\
         Content-Type: text/plain; charset=\"utf-8\"\r\n\
         \r\n\
         It works! This test email confirms Pine Mail is capturing SMTP traffic on port {smtp_port}.\r\n\
         \r\n\
         --{boundary}\r\n\
         Content-Type: text/html; charset=\"utf-8\"\r\n\
         \r\n\
         <html><body style=\"font-family:sans-serif\"><h2>✅ It works!</h2>\
         <p>This test email confirms Pine Mail is capturing SMTP traffic on port <b>{smtp_port}</b>.</p>\
         </body></html>\r\n\
         \r\n\
         --{boundary}--\r\n"
    )
    .into_bytes()
}

#[derive(serde::Deserialize)]
pub struct WaitQuery {
    pub to: Option<String>,
    pub from: Option<String>,
    pub subject: Option<String>,
    /// RFC3339 timestamp; only messages received after this count. Defaults to "now".
    pub since: Option<String>,
    pub timeout_ms: Option<u64>,
}

/// Long-polls for the next message matching the given filters — the primary hook for
/// agentic/e2e tests that need to wait for an email an action just triggered.
pub async fn wait_for_message(
    State(state): State<AppState>,
    Query(query): Query<WaitQuery>,
) -> Result<Json<MessageDetail>, ApiError> {
    let since = query
        .since
        .unwrap_or_else(|| chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true));
    let timeout_ms = query.timeout_ms.unwrap_or(10_000).clamp(100, 60_000);
    let mut rx = state.tx.subscribe();

    // Check pre-existing items first
    if let Some(summary) = state
        .store
        .find_matching(query.to.as_deref(), query.from.as_deref(), query.subject.as_deref(), Some(&since))?
    {
        if let Some(raw) = state.store.get_raw(&summary.id)? {
            if let Some(detail) = mail::parse_detail(&raw) {
                return Ok(Json(MessageDetail {
                    summary,
                    text_body: detail.text_body,
                    html_body: detail.html_body,
                    headers: detail.headers,
                    attachments: detail.attachments,
                }));
            }
        }
    }

    let sleep = tokio::time::sleep(std::time::Duration::from_millis(timeout_ms));
    tokio::pin!(sleep);

    loop {
        tokio::select! {
            _ = &mut sleep => {
                return Err(ApiError::Timeout("timed out waiting for a matching email"));
            }
            res = rx.recv() => {
                match res {
                    Ok(Event::New(ref summary)) => {
                        let to_match = query.to.as_deref().map_or(true, |t| summary.to.iter().any(|addr| addr.contains(t)));
                        let from_match = query.from.as_deref().map_or(true, |f| summary.from.contains(f));
                        let subject_match = query.subject.as_deref().map_or(true, |s| summary.subject.contains(s));
                        let since_match = summary.received_at > since;

                        if to_match && from_match && subject_match && since_match {
                            if let Ok(Some(raw)) = state.store.get_raw(&summary.id) {
                                if let Some(detail) = mail::parse_detail(&raw) {
                                    return Ok(Json(MessageDetail {
                                        summary: summary.clone(),
                                        text_body: detail.text_body,
                                        html_body: detail.html_body,
                                        headers: detail.headers,
                                        attachments: detail.attachments,
                                    }));
                                }
                            }
                        }
                    }
                    Ok(_) => {}
                    Err(broadcast::error::RecvError::Lagged(_)) => {
                        if let Ok(Some(summary)) = state
                            .store
                            .find_matching(query.to.as_deref(), query.from.as_deref(), query.subject.as_deref(), Some(&since))
                        {
                            if let Ok(Some(raw)) = state.store.get_raw(&summary.id) {
                                if let Some(detail) = mail::parse_detail(&raw) {
                                    return Ok(Json(MessageDetail {
                                        summary,
                                        text_body: detail.text_body,
                                        html_body: detail.html_body,
                                        headers: detail.headers,
                                        attachments: detail.attachments,
                                    }));
                                }
                            }
                        }
                    }
                    Err(broadcast::error::RecvError::Closed) => {
                        return Err(ApiError::Internal(anyhow::anyhow!("event bus closed")));
                    }
                }
            }
        }
    }
}


