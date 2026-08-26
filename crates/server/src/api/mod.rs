pub mod messages;
pub mod ws;

use axum::routing::{get, patch, post};
use axum::Router;
use serde::Serialize;
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;

pub use messages::AppState;

#[derive(Serialize)]
struct ServerInfo {
    version: &'static str,
    smtp_port: u16,
    http_port: u16,
}

async fn get_config(
    axum::extract::State(_state): axum::extract::State<AppState>,
) -> axum::Json<ServerInfo> {
    axum::Json(ServerInfo {
        version: env!("CARGO_PKG_VERSION"),
        smtp_port: std::env::var("SMTP_PORT")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(1025),
        http_port: std::env::var("HTTP_PORT")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(8025),
    })
}

pub fn router(state: AppState) -> Router {
    Router::new()
        .route(
            "/api/messages",
            get(messages::list_messages).delete(messages::clear_messages),
        )
        .route("/api/messages/bulk-delete", post(messages::bulk_delete))
        .route("/api/messages/bulk-read", patch(messages::bulk_mark_read))
        .route(
            "/api/messages/:id",
            get(messages::get_message).delete(messages::delete_message),
        )
        .route("/api/messages/:id/read", patch(messages::mark_read))
        .route("/api/messages/:id/raw", get(messages::get_raw))
        .route("/api/messages/:id/html", get(messages::get_html))
        .route(
            "/api/messages/:id/attachments/:index",
            get(messages::get_attachment),
        )
        .route("/api/messages/:id/extract", get(messages::get_extract))
        .route("/api/messages/:id/analysis", get(messages::get_analysis))
        .route("/api/wait", get(messages::wait_for_message))
        .route("/api/test-email", post(messages::send_test_email))
        .route("/api/events", get(ws::ws_handler))
        .route("/api/config", get(get_config))
        .layer(TraceLayer::new_for_http())
        .layer(CorsLayer::permissive())
        .with_state(state)
}
