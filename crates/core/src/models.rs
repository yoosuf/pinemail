use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
pub struct MessageSummary {
    pub id: String,
    pub from: String,
    pub to: Vec<String>,
    pub subject: String,
    pub size: i64,
    pub received_at: String,
    pub read: bool,
    pub has_html: bool,
    pub has_attachments: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct MessageDetail {
    #[serde(flatten)]
    pub summary: MessageSummary,
    pub text_body: Option<String>,
    pub html_body: Option<String>,
    pub headers: Vec<HeaderKv>,
    pub attachments: Vec<AttachmentMeta>,
}

#[derive(Debug, Clone, Serialize)]
pub struct HeaderKv {
    pub name: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct AttachmentMeta {
    pub index: usize,
    pub filename: String,
    pub content_type: String,
    pub size: usize,
    pub content_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct MessageList {
    pub messages: Vec<MessageSummary>,
    pub total: i64,
}

#[derive(Debug, Deserialize)]
pub struct ListQuery {
    pub search: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct MarkReadBody {
    pub read: bool,
}

#[derive(Debug, Deserialize)]
pub struct BulkIdsBody {
    pub ids: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct BulkReadBody {
    pub ids: Vec<String>,
    pub read: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SmsMessage {
    pub id: String,
    pub from: String,
    pub to: String,
    pub body: String,
    pub received_at: String,
    pub read: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct SmsList {
    pub messages: Vec<SmsMessage>,
    pub total: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Event {
    New(MessageSummary),
    Deleted { id: String },
    BulkDeleted { ids: Vec<String> },
    Cleared,
    Read { id: String, read: bool },
    BulkRead { ids: Vec<String>, read: bool },
    NewSms(SmsMessage),
    SmsDeleted { id: String },
    BulkSmsDeleted { ids: Vec<String> },
    SmsCleared,
    SmsRead { id: String, read: bool },
    BulkSmsRead { ids: Vec<String>, read: bool },
}

