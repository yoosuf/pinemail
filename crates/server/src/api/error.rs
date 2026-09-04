use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::json;

#[derive(Debug)]
pub enum ApiError {
    NotFound,
    BadRequest(String),
    UnprocessableEntity(&'static str),
    Timeout(&'static str),
    Internal(anyhow::Error),
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        match self {
            ApiError::NotFound => (StatusCode::NOT_FOUND, Json(json!({ "error": "not found" }))).into_response(),
            ApiError::BadRequest(msg) => (StatusCode::BAD_REQUEST, Json(json!({ "error": msg }))).into_response(),
            ApiError::UnprocessableEntity(msg) => {
                (StatusCode::UNPROCESSABLE_ENTITY, Json(json!({ "error": msg }))).into_response()
            }
            ApiError::Timeout(msg) => (StatusCode::REQUEST_TIMEOUT, Json(json!({ "error": msg }))).into_response(),
            ApiError::Internal(err) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": err.to_string() })),
            )
                .into_response(),
        }
    }
}

impl<E> From<E> for ApiError
where
    E: Into<anyhow::Error>,
{
    fn from(err: E) -> Self {
        ApiError::Internal(err.into())
    }
}
