export interface MessageSummary {
  id: string;
  from: string;
  to: string[];
  subject: string;
  size: number;
  received_at: string;
  read: boolean;
  has_html: boolean;
  has_attachments: boolean;
}

export interface HeaderKv {
  name: string;
  value: string;
}

export interface AttachmentMeta {
  index: number;
  filename: string;
  content_type: string;
  size: number;
  content_id: string | null;
}

export interface MessageDetail extends MessageSummary {
  text_body: string | null;
  html_body: string | null;
  headers: HeaderKv[];
  attachments: AttachmentMeta[];
}

export interface MessageList {
  messages: MessageSummary[];
  total: number;
}

export interface ExtractedSignals {
  codes: string[];
  links: string[];
}

export type CheckStatus = "pass" | "warn" | "fail";

export interface HtmlCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

export interface HtmlAnalysis {
  checks: HtmlCheck[];
  size_bytes: number;
  image_count: number;
  external_image_count: number;
  link_count: number;
}

export type SpamVerdict = "clean" | "suspicious" | "likely_spam";

export interface SpamRule {
  id: string;
  description: string;
  score: number;
}

export interface SpamAnalysis {
  score: number;
  verdict: SpamVerdict;
  rules: SpamRule[];
}

export interface MessageAnalysis {
  html: HtmlAnalysis;
  spam: SpamAnalysis;
}

export interface ServerConfig {
  version: string;
  smtp_port: number;
  http_port: number;
}

export type ServerEvent =
  | ({ type: "new" } & MessageSummary)
  | { type: "deleted"; id: string }
  | { type: "bulk_deleted"; ids: string[] }
  | { type: "cleared" }
  | { type: "read"; id: string; read: boolean }
  | { type: "bulk_read"; ids: string[]; read: boolean };
