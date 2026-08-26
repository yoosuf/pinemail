import { useEffect, useState } from "react";
import { api } from "../api";
import { confirmDialog } from "../confirmStore";
import { useInboxStore } from "../store";
import { btn } from "../ui";
import { CheckIcon, InboxIcon, TrashIcon } from "./Icons";
import type { CheckStatus, ExtractedSignals, MessageAnalysis, MessageDetail } from "../types";

type Tab = "preview" | "html_source" | "text" | "html_check" | "spam" | "headers" | "attachments" | "source";
type Device = "desktop" | "tablet" | "mobile";

const DEVICE_WIDTHS: Record<Device, string> = {
  desktop: "100%",
  tablet: "768px",
  mobile: "375px",
};

const STATUS_STYLES: Record<CheckStatus, string> = {
  pass: "border-emerald-900/50 bg-emerald-950/20 text-emerald-400",
  warn: "border-amber-900/50 bg-amber-950/20 text-amber-400",
  fail: "border-red-900/50 bg-red-950/20 text-red-400",
};

const STATUS_ICON: Record<CheckStatus, string> = { pass: "✓", warn: "!", fail: "✕" };

export function MessageView() {
  const id = useInboxStore((s) => s.selectedId);
  const setSelectedId = useInboxStore((s) => s.setSelectedId);
  const [detail, setDetail] = useState<MessageDetail | null>(null);
  const [signals, setSignals] = useState<ExtractedSignals | null>(null);
  const [analysis, setAnalysis] = useState<MessageAnalysis | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("preview");
  const [device, setDevice] = useState<Device>("desktop");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setDetail(null);
    setSignals(null);
    setAnalysis(null);
    setSource(null);
    setError(null);
    api
      .get(id)
      .then((d) => {
        setDetail(d);
        setTab(d.html_body ? "preview" : d.text_body ? "text" : "headers");
        if (!d.read) api.markRead(id, true).catch(() => {});
      })
      .catch((e) => setError(String(e)));
    api.extract(id).then(setSignals).catch(() => {});
    api.analysis(id).then(setAnalysis).catch(() => {});
  }, [id]);

  useEffect(() => {
    if (id && tab === "source" && source === null) {
      api.source(id).then(setSource).catch((e) => setSource(`Failed to load source: ${e}`));
    }
  }, [tab, id, source]);

  if (!id) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-900 text-zinc-600 ring-1 ring-zinc-800">
          <InboxIcon width={22} height={22} />
        </div>
        <p className="text-sm text-zinc-600">Select a message to preview it</p>
      </div>
    );
  }
  if (error) {
    return <div className="p-6 text-sm text-red-400">Failed to load message: {error}</div>;
  }
  if (!detail) {
    return <div className="p-6 text-sm text-zinc-500">Loading…</div>;
  }

  async function handleDelete() {
    const ok = await confirmDialog({
      title: "Delete this message?",
      ...(detail?.subject ? { description: `"${detail.subject}" will be permanently removed.` } : {}),
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    await api.delete(id as string);
    setSelectedId(null);
  }

  const tabs: [Tab, string, boolean][] = [
    ["preview", "Preview", !!detail.html_body],
    ["html_source", "HTML Source", !!detail.html_body],
    ["text", "Text", !!detail.text_body],
    ["html_check", "HTML Check", true],
    ["spam", "Spam Analysis", true],
    ["headers", "Headers", true],
    ["attachments", `Attachments (${detail.attachments.length})`, detail.attachments.length > 0],
    ["source", "Source", true],
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-zinc-800/80 p-4">
        <h2 className="truncate text-base font-semibold tracking-tight text-zinc-100">
          {detail.subject || "(no subject)"}
        </h2>
        <dl className="mt-2 grid grid-cols-[3rem_1fr] gap-x-2 gap-y-1 text-xs text-zinc-400">
          <dt className="text-zinc-600">From</dt>
          <dd className="truncate">{detail.from}</dd>
          <dt className="text-zinc-600">To</dt>
          <dd className="truncate">{detail.to.join(", ")}</dd>
        </dl>
        <div className="mt-3 flex gap-2">
          <a href={api.rawUrl(id)} className={btn.secondary}>
            Download .eml
          </a>
          <button onClick={handleDelete} className={btn.danger}>
            <TrashIcon />
            Delete
          </button>
        </div>
        {signals && (signals.codes.length > 0 || signals.links.length > 0) && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-indigo-900/50 bg-indigo-950/20 px-2.5 py-1.5 text-xs">
            <span className="font-medium text-indigo-400">Agent signals</span>
            {signals.codes.map((c) => (
              <code key={c} className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-200">
                {c}
              </code>
            ))}
            {signals.links.map((l) => (
              <a
                key={l}
                href={l}
                target="_blank"
                rel="noreferrer"
                className="truncate text-indigo-400 hover:underline"
              >
                {l}
              </a>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-b border-zinc-800/80 px-4 pt-2">
        <div className="flex gap-4 overflow-x-auto text-sm">
          {tabs
            .filter(([, , enabled]) => enabled)
            .map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`shrink-0 border-b-2 pb-2 pt-1 text-sm font-medium transition-colors ${
                  tab === key
                    ? "border-indigo-500 text-zinc-100"
                    : "border-transparent text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {label}
              </button>
            ))}
        </div>
        {tab === "preview" && detail.html_body && (
          <div className="mb-1.5 flex shrink-0 gap-0.5 rounded-lg border border-zinc-800 bg-zinc-900/60 p-0.5">
            {(["desktop", "tablet", "mobile"] as Device[]).map((d) => (
              <button
                key={d}
                onClick={() => setDevice(d)}
                className={`rounded-md px-2 py-1 text-xs capitalize transition-colors ${
                  device === d ? "bg-zinc-800 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto bg-zinc-950">
        {tab === "preview" && detail.html_body && (
          <div className="flex h-full justify-center overflow-auto p-4">
            <iframe
              title="email-html"
              src={api.htmlUrl(id)}
              sandbox=""
              style={{ width: DEVICE_WIDTHS[device] }}
              className="h-full min-h-[600px] rounded-lg border border-zinc-800 bg-white transition-[width]"
            />
          </div>
        )}
        {tab === "html_source" && (
          <pre className="whitespace-pre-wrap break-all p-4 font-mono text-xs text-zinc-300">
            {detail.html_body}
          </pre>
        )}
        {tab === "text" && (
          <pre className="whitespace-pre-wrap p-4 text-sm text-zinc-300">{detail.text_body}</pre>
        )}
        {tab === "html_check" && <HtmlCheckPanel analysis={analysis} />}
        {tab === "spam" && <SpamPanel analysis={analysis} />}
        {tab === "headers" && (
          <table className="w-full text-xs">
            <tbody>
              {detail.headers.map((h, i) => (
                <tr key={i} className="border-b border-zinc-900">
                  <td className="w-40 whitespace-nowrap px-4 py-1.5 align-top font-medium text-zinc-500">
                    {h.name}
                  </td>
                  <td className="px-4 py-1.5 text-zinc-300">{h.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {tab === "attachments" && (
          <ul className="p-4 text-sm">
            {detail.attachments.map((a) => (
              <li key={a.index} className="mb-2">
                <a href={api.attachmentUrl(id, a.index)} className="text-indigo-400 hover:underline">
                  {a.filename}
                </a>
                <span className="ml-2 text-xs text-zinc-500">
                  {a.content_type} · {Math.max(1, Math.round(a.size / 1024))} KB
                </span>
              </li>
            ))}
          </ul>
        )}
        {tab === "source" && (
          <pre className="whitespace-pre-wrap break-all p-4 font-mono text-xs text-zinc-300">
            {source ?? "Loading…"}
          </pre>
        )}
      </div>
    </div>
  );
}

function HtmlCheckPanel({ analysis }: { analysis: MessageAnalysis | null }) {
  if (!analysis) return <div className="p-4 text-sm text-zinc-500">Loading…</div>;
  const { html } = analysis;
  return (
    <div className="p-4">
      <div className="mb-3 flex flex-wrap gap-4 text-xs text-zinc-400">
        <span>{(html.size_bytes / 1024).toFixed(1)} KB</span>
        <span>{html.image_count} image(s)</span>
        <span>{html.external_image_count} external image(s)</span>
        <span>{html.link_count} link(s)</span>
      </div>
      <ul className="space-y-2">
        {html.checks.map((c) => (
          <li key={c.id} className={`rounded-lg border px-3 py-2 text-sm ${STATUS_STYLES[c.status]}`}>
            <div className="flex items-center gap-2 font-medium">
              <span>{STATUS_ICON[c.status]}</span>
              <span>{c.label}</span>
            </div>
            <p className="mt-0.5 text-xs text-zinc-400">{c.detail}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SpamPanel({ analysis }: { analysis: MessageAnalysis | null }) {
  if (!analysis) return <div className="p-4 text-sm text-zinc-500">Loading…</div>;
  const { spam } = analysis;
  const verdictStyle =
    spam.verdict === "clean"
      ? "text-emerald-400"
      : spam.verdict === "suspicious"
        ? "text-amber-400"
        : "text-red-400";
  const verdictLabel =
    spam.verdict === "clean" ? "Clean" : spam.verdict === "suspicious" ? "Suspicious" : "Likely spam";

  return (
    <div className="p-4">
      <div className="mb-4 flex items-baseline gap-3">
        <span className={`text-2xl font-bold tracking-tight ${verdictStyle}`}>{spam.score.toFixed(1)}</span>
        <span className={`text-sm font-medium ${verdictStyle}`}>{verdictLabel}</span>
      </div>
      {spam.rules.length === 0 ? (
        <p className="flex items-center gap-1.5 text-sm text-zinc-500">
          <CheckIcon className="text-emerald-400" />
          No spam heuristics triggered.
        </p>
      ) : (
        <ul className="space-y-2">
          {spam.rules.map((r) => (
            <li
              key={r.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-sm"
            >
              <span className="text-zinc-300">{r.description}</span>
              <span className="shrink-0 text-xs text-zinc-500">+{r.score.toFixed(1)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-xs text-zinc-600">
        Heuristic local score only — not a substitute for a real spam-filter test.
      </p>
    </div>
  );
}
