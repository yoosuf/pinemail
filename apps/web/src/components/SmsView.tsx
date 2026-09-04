import { useEffect, useState } from "react";
import { api } from "../api";
import { useInboxStore } from "../store";
import type { ExtractedSignals, SmsMessage } from "../types";
import { btn } from "../ui";
import { CopyIcon, PhoneIcon, TrashIcon } from "./Icons";

export function SmsView() {
  const smsSelectedId = useInboxStore((s) => s.smsSelectedId);
  const setSmsSelectedId = useInboxStore((s) => s.setSmsSelectedId);
  const [sms, setSms] = useState<SmsMessage | null>(null);
  const [signals, setSignals] = useState<ExtractedSignals | null>(null);
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!smsSelectedId) {
      setSms(null);
      setSignals(null);
      setLoading(false);
      return;
    }

    let isMounted = true;
    setSms(null);
    setSignals(null);
    setLoading(true);

    api
      .getSms(smsSelectedId)
      .then((data) => {
        if (!isMounted) return;
        setSms(data);
        if (!data.read) {
          void api.markSmsRead(data.id, true);
        }
      })
      .catch(() => {
        if (isMounted) setSms(null);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    api
      .extractSms(smsSelectedId)
      .then((sig) => {
        if (isMounted) setSignals(sig);
      })
      .catch(() => {
        if (isMounted) setSignals(null);
      });

    return () => {
      isMounted = false;
    };
  }, [smsSelectedId]);

  const copyToClipboard = (text: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const handleDelete = async () => {
    if (!sms) return;
    await api.deleteSms(sms.id);
    setSmsSelectedId(null);
  };

  if (!smsSelectedId) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center text-zinc-500">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-900/80 text-zinc-600 ring-1 ring-zinc-800">
          <PhoneIcon width={24} height={24} />
        </div>
        <p className="mt-3 text-sm font-medium text-zinc-400">Select an SMS message to view details</p>
        <p className="mt-1 text-xs text-zinc-600">SMS messages captured via API or webhook will appear here.</p>
      </div>
    );
  }

  if (loading || !sms || sms.id !== smsSelectedId) {
    return (
      <div className="flex h-full flex-col bg-zinc-950 p-6 space-y-6 animate-pulse">
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4">
          <div className="space-y-2">
            <div className="h-5 w-40 rounded-md bg-zinc-800" />
            <div className="h-3 w-28 rounded bg-zinc-800/60" />
          </div>
          <div className="h-8 w-20 rounded-lg bg-zinc-800/60" />
        </div>
        <div className="rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-4 space-y-2">
          <div className="h-3 w-36 rounded bg-zinc-800/80" />
          <div className="h-7 w-24 rounded-lg bg-zinc-800" />
        </div>
        <div className="space-y-2 max-w-lg">
          <div className="h-3 w-32 rounded bg-zinc-800/60" />
          <div className="h-24 w-full rounded-2xl bg-zinc-900/80 border border-zinc-800/60" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-zinc-950">
      {/* Header Toolbar */}
      <div className="flex items-center justify-between border-b border-zinc-800/80 px-6 py-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-zinc-100">{sms.from}</h2>
            <span className="rounded-md bg-indigo-500/10 px-2 py-0.5 text-xs font-medium text-indigo-400 ring-1 ring-inset ring-indigo-500/20">
              SMS
            </span>
          </div>
          <p className="mt-0.5 text-xs text-zinc-400">To: {sms.to}</p>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => void handleDelete()} className={`${btn.secondary} text-red-400 hover:text-red-300`}>
            <TrashIcon width={14} height={14} />
            Delete
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Signal Extraction Box (OTP Codes & Links) */}
        {signals && (signals.codes.length > 0 || signals.links.length > 0) && (
          <div className="rounded-xl border border-indigo-500/20 bg-indigo-950/20 p-4 backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400">
                Auto-Detected Verification Signals
              </span>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {signals.codes.map((code) => (
                <button
                  key={code}
                  onClick={() => copyToClipboard(code)}
                  className="flex items-center gap-1.5 rounded-lg border border-indigo-500/30 bg-indigo-900/40 px-3 py-1.5 text-sm font-mono font-bold text-indigo-200 transition hover:bg-indigo-900/70"
                >
                  <CopyIcon width={14} height={14} />
                  <span>{code}</span>
                  {copiedText === code && <span className="ml-1 text-[10px] text-green-400">Copied!</span>}
                </button>
              ))}

              {signals.links.map((link) => (
                <a
                  key={link}
                  href={link}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 truncate rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-indigo-300 transition hover:bg-zinc-800"
                >
                  <span className="truncate">{link}</span>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Message Bubble Container */}
        <div className="flex flex-col items-start max-w-2xl">
          <div className="mb-1 text-xs text-zinc-500">{new Date(sms.received_at).toLocaleString()}</div>
          <div className="rounded-2xl rounded-tl-sm border border-zinc-800 bg-zinc-900/80 px-5 py-4 text-sm leading-relaxed text-zinc-200 shadow-md">
            {sms.body || <span className="italic text-zinc-600">(empty SMS message)</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
