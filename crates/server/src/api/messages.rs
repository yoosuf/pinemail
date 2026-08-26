use std::sync::Arc;

use axum::extract::{Path, Query, State};
use axum::http::{header, StatusCode};
use axum::response::IntoResponse;
use axum::Json;
use tokio::sync::broadcast;

use pinemail_core::mail;
use pinemail_core::models::{Event, ListQuery, MarkReadBody, MessageDetail, MessageList};
use pinemail_core::store::{NewMessage, Store};

#[derive(Clone)]
pub struct AppState {
    pub store: Arc<Store>,
    pub tx: broadcast::Sender<Event>,
}

pub async fn list_messages(
    State(state): State<AppState>,
    Query(query): Query<ListQuery>,
) -> impl IntoResponse {
    let limit = query.limit.unwrap_or(50).clamp(1, 500);
    let offset = query.offset.unwrap_or(0).max(0);

    match state.store.list(query.search.as_deref(), limit, offset) {
        Ok((messages, total)) => Json(MessageList { messages, total }).into_response(),
        Err(err) => (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()).into_response(),
    }
}

pub async fn clear_messages(State(state): State<AppState>) -> impl IntoResponse {
    match state.store.clear() {
        Ok(()) => {
            let _ = state.tx.send(Event::Cleared);
            StatusCode::NO_CONTENT.into_response()
        }
        Err(err) => (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()).into_response(),
    }
}

pub async fn get_message(State(state): State<AppState>, Path(id): Path<String>) -> impl IntoResponse {
    let summary = match state.store.get_summary(&id) {
        Ok(Some(s)) => s,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(err) => return (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()).into_response(),
    };
    let raw = match state.store.get_raw(&id) {
        Ok(Some(raw)) => raw,
        _ => return StatusCode::NOT_FOUND.into_response(),
    };

    let Some(detail) = mail::parse_detail(&raw) else {
        return (StatusCode::UNPROCESSABLE_ENTITY, "could not parse message").into_response();
    };

    Json(MessageDetail {
        summary,
        text_body: detail.text_body,
        html_body: detail.html_body,
        headers: detail.headers,
        attachments: detail.attachments,
    })
    .into_response()
}

pub async fn delete_message(State(state): State<AppState>, Path(id): Path<String>) -> impl IntoResponse {
    match state.store.delete(&id) {
        Ok(true) => {
            let _ = state.tx.send(Event::Deleted { id });
            StatusCode::NO_CONTENT.into_response()
        }
        Ok(false) => StatusCode::NOT_FOUND.into_response(),
        Err(err) => (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()).into_response(),
    }
}

pub async fn mark_read(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<MarkReadBody>,
) -> impl IntoResponse {
    match state.store.mark_read(&id, body.read) {
        Ok(true) => {
            let _ = state.tx.send(Event::Read { id, read: body.read });
            StatusCode::NO_CONTENT.into_response()
        }
        Ok(false) => StatusCode::NOT_FOUND.into_response(),
        Err(err) => (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()).into_response(),
    }
}

#[derive(serde::Deserialize)]
pub struct BulkIdsBody {
    pub ids: Vec<String>,
}

pub async fn bulk_delete(State(state): State<AppState>, Json(body): Json<BulkIdsBody>) -> impl IntoResponse {
    if body.ids.is_empty() {
        return StatusCode::BAD_REQUEST.into_response();
    }
    match state.store.delete_many(&body.ids) {
        Ok(_) => {
            let _ = state.tx.send(Event::BulkDeleted { ids: body.ids });
            StatusCode::NO_CONTENT.into_response()
        }
        Err(err) => (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()).into_response(),
    }
}

#[derive(serde::Deserialize)]
pub struct BulkReadBody {
    pub ids: Vec<String>,
    pub read: bool,
}

pub async fn bulk_mark_read(State(state): State<AppState>, Json(body): Json<BulkReadBody>) -> impl IntoResponse {
    if body.ids.is_empty() {
        return StatusCode::BAD_REQUEST.into_response();
    }
    match state.store.mark_read_many(&body.ids, body.read) {
        Ok(_) => {
            let _ = state.tx.send(Event::BulkRead { ids: body.ids, read: body.read });
            StatusCode::NO_CONTENT.into_response()
        }
        Err(err) => (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()).into_response(),
    }
}

pub async fn get_raw(State(state): State<AppState>, Path(id): Path<String>) -> impl IntoResponse {
    match state.store.get_raw(&id) {
        Ok(Some(raw)) => (
            [
                (header::CONTENT_TYPE, "message/rfc822".to_string()),
                (
                    header::CONTENT_DISPOSITION,
                    format!("attachment; filename=\"{id}.eml\""),
                ),
            ],
            raw,
        )
            .into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(err) => (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()).into_response(),
    }
}

pub async fn get_html(State(state): State<AppState>, Path(id): Path<String>) -> impl IntoResponse {
    let raw = match state.store.get_raw(&id) {
        Ok(Some(raw)) => raw,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(err) => return (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()).into_response(),
    };
    match mail::parse_detail(&raw).and_then(|d| d.html_body) {
        Some(html) => ([(header::CONTENT_TYPE, "text/html; charset=utf-8")], html).into_response(),
        None => (StatusCode::NOT_FOUND, "no html body").into_response(),
    }
}

pub async fn get_attachment(
    State(state): State<AppState>,
    Path((id, index)): Path<(String, usize)>,
) -> impl IntoResponse {
    let raw = match state.store.get_raw(&id) {
        Ok(Some(raw)) => raw,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(err) => return (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()).into_response(),
    };
    match mail::attachment_bytes(&raw, index) {
        Some((bytes, content_type, filename)) => (
            [
                (header::CONTENT_TYPE, content_type),
                (
                    header::CONTENT_DISPOSITION,
                    format!("attachment; filename=\"{filename}\""),
                ),
            ],
            bytes,
        )
            .into_response(),
        None => StatusCode::NOT_FOUND.into_response(),
    }
}

/// Pulls likely OTP codes and links out of a message body — built for agents/tests
/// that need to grab a verification code or magic link without writing their own regex.
pub async fn get_extract(State(state): State<AppState>, Path(id): Path<String>) -> impl IntoResponse {
    let raw = match state.store.get_raw(&id) {
        Ok(Some(raw)) => raw,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(err) => return (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()).into_response(),
    };
    let Some(detail) = mail::parse_detail(&raw) else {
        return (StatusCode::UNPROCESSABLE_ENTITY, "could not parse message").into_response();
    };
    let signals = mail::extract_signals(detail.text_body.as_deref(), detail.html_body.as_deref());
    Json(signals).into_response()
}

/// HTML email-client-compatibility checks + a heuristic spam score, so the UI can
/// show the same kind of report Litmus/mail-tester-style tools give — without
/// leaving the local dev loop.
pub async fn get_analysis(State(state): State<AppState>, Path(id): Path<String>) -> impl IntoResponse {
    let raw = match state.store.get_raw(&id) {
        Ok(Some(raw)) => raw,
        Ok(None) => return StatusCode::NOT_FOUND.into_response(),
        Err(err) => return (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()).into_response(),
    };
    let Some(detail) = mail::parse_detail(&raw) else {
        return (StatusCode::UNPROCESSABLE_ENTITY, "could not parse message").into_response();
    };
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

    Json(serde_json::json!({ "html": html, "spam": spam })).into_response()
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
) -> impl IntoResponse {
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

    match state.store.insert(msg) {
        Ok(summary) => {
            let _ = state.tx.send(Event::New(summary.clone()));
            Json(summary).into_response()
        }
        Err(err) => (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()).into_response(),
    }
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

const WAIT_POLL_INTERVAL_MS: u64 = 250;

/// Long-polls for the next message matching the given filters — the primary hook for
/// agentic/e2e tests that need to wait for an email an action just triggered.
pub async fn wait_for_message(
    State(state): State<AppState>,
    Query(query): Query<WaitQuery>,
) -> impl IntoResponse {
    let since = query
        .since
        .unwrap_or_else(|| chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true));
    let timeout_ms = query.timeout_ms.unwrap_or(10_000).clamp(100, 60_000);
    let deadline = tokio::time::Instant::now() + std::time::Duration::from_millis(timeout_ms);

    loop {
        match state
            .store
            .find_matching(query.to.as_deref(), query.from.as_deref(), query.subject.as_deref(), Some(&since))
        {
            Ok(Some(summary)) => {
                let raw = match state.store.get_raw(&summary.id) {
                    Ok(Some(raw)) => raw,
                    _ => return StatusCode::NOT_FOUND.into_response(),
                };
                let Some(detail) = mail::parse_detail(&raw) else {
                    return (StatusCode::UNPROCESSABLE_ENTITY, "could not parse message").into_response();
                };
                return Json(MessageDetail {
                    summary,
                    text_body: detail.text_body,
                    html_body: detail.html_body,
                    headers: detail.headers,
                    attachments: detail.attachments,
                })
                .into_response();
            }
            Ok(None) => {}
            Err(err) => return (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()).into_response(),
        }

        if tokio::time::Instant::now() >= deadline {
            return (
                StatusCode::REQUEST_TIMEOUT,
                Json(serde_json::json!({ "error": "timed out waiting for a matching email" })),
            )
                .into_response();
        }
        tokio::time::sleep(std::time::Duration::from_millis(WAIT_POLL_INTERVAL_MS)).await;
    }
}
