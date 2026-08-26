use mail_parser::{Address, Message, MessageParser, MimeHeaders};

use crate::models::{AttachmentMeta, HeaderKv};

/// Flattens a parsed address field into "Name <email>" strings.
pub fn format_address(addr: Option<&Address>) -> Vec<String> {
    let Some(addr) = addr else {
        return Vec::new();
    };
    let mut out = Vec::new();
    match addr {
        Address::List(list) => {
            for a in list {
                out.push(format_addr(a.name.as_deref(), a.address.as_deref()));
            }
        }
        Address::Group(groups) => {
            for g in groups {
                for a in &g.addresses {
                    out.push(format_addr(a.name.as_deref(), a.address.as_deref()));
                }
            }
        }
    }
    out
}

fn format_addr(name: Option<&str>, email: Option<&str>) -> String {
    let email = email.unwrap_or("");
    match name {
        Some(n) if !n.is_empty() => format!("{n} <{email}>"),
        _ => email.to_string(),
    }
}

/// Quick check used for list rendering, without allocating full body strings.
pub fn body_flags(raw: &[u8]) -> (bool, bool) {
    match MessageParser::default().parse(raw) {
        Some(msg) => (msg.html_body_count() > 0, msg.attachment_count() > 0),
        None => (false, false),
    }
}

pub struct ParsedDetail {
    pub text_body: Option<String>,
    pub html_body: Option<String>,
    pub headers: Vec<HeaderKv>,
    pub attachments: Vec<AttachmentMeta>,
}

pub fn parse_detail(raw: &[u8]) -> Option<ParsedDetail> {
    let msg = MessageParser::default().parse(raw)?;
    Some(build_detail(&msg))
}

fn build_detail(msg: &Message) -> ParsedDetail {
    let headers = msg
        .headers_raw()
        .map(|(name, value)| HeaderKv {
            name: name.to_string(),
            value: value.trim().to_string(),
        })
        .collect();

    let text_body = msg.body_text(0).map(|c| c.to_string());
    let html_body = msg.body_html(0).map(|c| c.to_string());

    let attachments = msg
        .attachments()
        .enumerate()
        .map(|(index, part)| {
            let content_type = part
                .content_type()
                .map(|ct| match ct.subtype() {
                    Some(sub) => format!("{}/{}", ct.ctype(), sub),
                    None => ct.ctype().to_string(),
                })
                .unwrap_or_else(|| "application/octet-stream".to_string());
            AttachmentMeta {
                index,
                filename: part
                    .attachment_name()
                    .map(|s| s.to_string())
                    .unwrap_or_else(|| format!("attachment-{index}")),
                content_type,
                size: part.contents().len(),
                content_id: part.content_id().map(|s| s.to_string()),
            }
        })
        .collect();

    ParsedDetail {
        text_body,
        html_body,
        headers,
        attachments,
    }
}

/// Returns the raw bytes and content-type of a single attachment by index.
pub fn attachment_bytes(raw: &[u8], index: usize) -> Option<(Vec<u8>, String, String)> {
    let msg = MessageParser::default().parse(raw)?;
    let part = msg.attachment(index as u32)?;
    let content_type = part
        .content_type()
        .map(|ct| match ct.subtype() {
            Some(sub) => format!("{}/{}", ct.ctype(), sub),
            None => ct.ctype().to_string(),
        })
        .unwrap_or_else(|| "application/octet-stream".to_string());
    let filename = part
        .attachment_name()
        .map(|s| s.to_string())
        .unwrap_or_else(|| format!("attachment-{index}"));
    Some((part.contents().to_vec(), content_type, filename))
}

/// Derives display subject/from/to for a freshly received message, preferring the
/// parsed header values but falling back to the SMTP envelope when headers are absent.
pub fn envelope_display(raw: &[u8], envelope_from: &str, envelope_to: &[String]) -> (String, String, Vec<String>) {
    let Some(msg) = MessageParser::default().parse(raw) else {
        return (
            "(no subject)".to_string(),
            envelope_from.to_string(),
            envelope_to.to_vec(),
        );
    };

    let subject = msg.subject().map(|s| s.to_string()).unwrap_or_else(|| "(no subject)".to_string());

    let from = format_address(msg.from())
        .into_iter()
        .next()
        .unwrap_or_else(|| envelope_from.to_string());

    let to = {
        let headers_to = format_address(msg.to());
        if headers_to.is_empty() {
            envelope_to.to_vec()
        } else {
            headers_to
        }
    };

    (subject, from, to)
}

/// Codes and links pulled out of a message body — built for agentic e2e tests that
/// need to grab an OTP or a magic link without hand-rolling regexes of their own.
#[derive(Debug, Clone, serde::Serialize)]
pub struct ExtractedSignals {
    pub codes: Vec<String>,
    pub links: Vec<String>,
}

fn code_regex() -> &'static regex::Regex {
    static RE: std::sync::OnceLock<regex::Regex> = std::sync::OnceLock::new();
    RE.get_or_init(|| regex::Regex::new(r"\b\d{4,8}\b").unwrap())
}

fn link_regex() -> &'static regex::Regex {
    static RE: std::sync::OnceLock<regex::Regex> = std::sync::OnceLock::new();
    RE.get_or_init(|| regex::Regex::new(r#"https?://[^\s"'<>]+"#).unwrap())
}

fn strip_tags(html: &str) -> String {
    let mut out = String::with_capacity(html.len());
    let mut in_tag = false;
    for c in html.chars() {
        match c {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => out.push(c),
            _ => {}
        }
    }
    out
}

pub fn extract_signals(text: Option<&str>, html: Option<&str>) -> ExtractedSignals {
    let plain_html = html.map(|h| strip_tags(h)).unwrap_or_default();
    let haystack = format!("{} {}", text.unwrap_or(""), plain_html);

    let mut codes = Vec::new();
    for m in code_regex().find_iter(&haystack) {
        let s = m.as_str().to_string();
        if !codes.contains(&s) {
            codes.push(s);
        }
    }

    let mut links = Vec::new();
    for m in link_regex().find_iter(&haystack) {
        let s = m.as_str().trim_end_matches(['.', ',', ')']).to_string();
        if !links.contains(&s) {
            links.push(s);
        }
    }

    ExtractedSignals { codes, links }
}

