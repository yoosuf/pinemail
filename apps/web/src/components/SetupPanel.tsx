import { useEffect, useState } from "react";
import { api } from "../api";
import { btn, card, input } from "../ui";
import { CheckIcon, CloseIcon, CopyIcon, SendIcon } from "./Icons";
import type { ServerConfig } from "../types";

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(value).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-zinc-800 px-2 py-1 text-xs text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-100"
    >
      {copied ? <CheckIcon className="text-emerald-400" /> : <CopyIcon />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function ConnectionField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2">
      <div>
        <div className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</div>
        <div className="font-mono text-sm text-zinc-100">{value}</div>
      </div>
      <CopyButton value={value} />
    </div>
  );
}

type Snippet = "node" | "python" | "env";

function snippetFor(kind: Snippet, host: string, port: number): string {
  switch (kind) {
    case "node":
      return `import nodemailer from "nodemailer";

const transport = nodemailer.createTransport({
  host: "${host}",
  port: ${port},
  secure: false,
});

await transport.sendMail({
  from: "you@yourapp.dev",
  to: "user@example.com",
  subject: "Hello",
  text: "Sent via Pine Mail",
});`;
    case "python":
      return `import smtplib
from email.mime.text import MIMEText

msg = MIMEText("Sent via Pine Mail")
msg["Subject"] = "Hello"
msg["From"] = "you@yourapp.dev"
msg["To"] = "user@example.com"

with smtplib.SMTP("${host}", ${port}) as s:
    s.send_message(msg)`;
    case "env":
      return `SMTP_HOST=${host}
SMTP_PORT=${port}
SMTP_SECURE=false
SMTP_USER=
SMTP_PASSWORD=`;
  }
}

const SNIPPET_TABS: [Snippet, string][] = [
  ["node", "Node.js"],
  ["python", "Python"],
  ["env", ".env"],
];

export function SetupPanel({ onClose }: { onClose: () => void }) {
  const [config, setConfig] = useState<ServerConfig | null>(null);
  const [snippet, setSnippet] = useState<Snippet>("node");
  const [testTo, setTestTo] = useState("");
  const [sendState, setSendState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  useEffect(() => {
    api.config().then(setConfig).catch(() => {});
  }, []);

  const host = window.location.hostname;
  const port = config?.smtp_port ?? 1025;

  async function handleSendTest() {
    setSendState("sending");
    try {
      await api.sendTestEmail(testTo);
      setSendState("sent");
      setTimeout(() => setSendState("idle"), 2000);
    } catch {
      setSendState("error");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-zinc-800 bg-zinc-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <h2 className="text-sm font-semibold tracking-tight text-zinc-100">Connect your app</h2>
          <button onClick={onClose} className={btn.ghost} aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        <div className="flex-1 space-y-6 p-5">
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              SMTP connection
            </h3>
            <div className="space-y-2">
              <ConnectionField label="Host" value={host} />
              <ConnectionField label="Port" value={String(port)} />
              <ConnectionField label="Auth" value="none required" />
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Point your mailer here
            </h3>
            <div className={card}>
              <div className="flex gap-1 border-b border-zinc-800 px-2 pt-2">
                {SNIPPET_TABS.map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setSnippet(key)}
                    className={`rounded-t-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      snippet === key
                        ? "border-b-2 border-indigo-500 text-zinc-100"
                        : "text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    {label}
                  </button>
                ))}
                <div className="ml-auto pb-1 pr-1">
                  <CopyButton value={snippetFor(snippet, host, port)} />
                </div>
              </div>
              <pre className="overflow-x-auto p-3 font-mono text-[11px] leading-relaxed text-zinc-300">
                {snippetFor(snippet, host, port)}
              </pre>
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Send a test email
            </h3>
            <p className="mb-2 text-xs text-zinc-500">
              Verify Pine Mail is receiving mail without leaving the browser.
            </p>
            <div className="flex gap-2">
              <input
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
                placeholder="you@example.com (optional)"
                className={input}
              />
              <button
                onClick={handleSendTest}
                disabled={sendState === "sending"}
                className={`${btn.primary} shrink-0`}
              >
                <SendIcon />
                {sendState === "sending" ? "Sending…" : sendState === "sent" ? "Sent!" : "Send"}
              </button>
            </div>
            {sendState === "error" && (
              <p className="mt-2 text-xs text-red-400">Failed to send test email.</p>
            )}
          </section>
        </div>

        <footer className="border-t border-zinc-800 px-5 py-4 text-xs text-zinc-500">
          Built by{" "}
          <a
            href="https://yoosuf.me/"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-indigo-400 hover:underline"
          >
            Yoosuf
          </a>
          , who also offers{" "}
          <a
            href="https://yoosuf.me/services/"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-indigo-400 hover:underline"
          >
            fractional CTO services
          </a>
          .
        </footer>
      </div>
    </div>
  );
}
