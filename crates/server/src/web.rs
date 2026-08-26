use axum::http::{header, StatusCode, Uri};
use axum::response::{IntoResponse, Response};
use rust_embed::RustEmbed;

#[derive(RustEmbed)]
#[folder = "../../apps/web/dist"]
pub struct Assets;

/// Serves the embedded SPA, falling back to index.html for client-side routes.
pub async fn static_handler(uri: Uri) -> Response {
    let path = uri.path().trim_start_matches('/');
    serve_embedded(path).unwrap_or_else(|| serve_embedded("index.html").unwrap_or_else(not_found))
}

fn serve_embedded(path: &str) -> Option<Response> {
    let file = Assets::get(path)?;
    let mime = mime_guess::from_path(path).first_or_octet_stream();
    Some(
        ([(header::CONTENT_TYPE, mime.as_ref().to_string())], file.data.into_owned())
            .into_response(),
    )
}

fn not_found() -> Response {
    (StatusCode::NOT_FOUND, "not found").into_response()
}
