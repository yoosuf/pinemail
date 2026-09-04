use std::env;

#[derive(Clone, Debug)]
pub struct Config {
    /// Port the SMTP server listens on.
    pub smtp_port: u16,
    /// Port the HTTP API + web UI listens on.
    pub http_port: u16,
    /// Bind address for both servers.
    pub bind_addr: String,
    /// Path to the SQLite database file. Use ":memory:" for a non-persistent store.
    pub db_path: String,
    /// Maximum number of messages retained before the oldest are pruned. 0 = unlimited.
    pub max_messages: u64,
    /// Hostname advertised in the SMTP EHLO/HELO greeting.
    pub smtp_hostname: String,
}

impl Config {
    pub fn from_env() -> Self {
        Self {
            smtp_port: env_u16("SMTP_PORT", 1025),
            http_port: env_u16("HTTP_PORT", 8025),
            bind_addr: env::var("BIND_ADDR").unwrap_or_else(|_| "0.0.0.0".to_string()),
            db_path: env::var("DB_PATH").unwrap_or_else(|_| "pinemail.db".to_string()),
            max_messages: env::var("MAX_MESSAGES")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(1000),
            smtp_hostname: env::var("SMTP_HOSTNAME").unwrap_or_else(|_| "pinemail".to_string()),
        }
    }
}

fn env_u16(key: &str, default: u16) -> u16 {
    env::var(key)
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}
