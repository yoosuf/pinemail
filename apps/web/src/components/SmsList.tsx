import { useEffect, useRef } from "react";
import { confirmDialog } from "../confirmStore";
import { useInboxStore } from "../store";
import { btn } from "../ui";
import { CheckIcon, MailReadIcon, PhoneIcon, TrashIcon } from "./Icons";

export function SmsList() {
  const smsList = useInboxStore((s) => s.smsList);
  const smsTotal = useInboxStore((s) => s.smsTotal);
  const smsSelectedId = useInboxStore((s) => s.smsSelectedId);
  const setSmsSelectedId = useInboxStore((s) => s.setSmsSelectedId);
  const smsSelectedIds = useInboxStore((s) => s.smsSelectedIds);
  const toggleSmsSelected = useInboxStore((s) => s.toggleSmsSelected);
  const toggleSelectAllSmsLoaded = useInboxStore((s) => s.toggleSelectAllSmsLoaded);
  const smsLoading = useInboxStore((s) => s.smsLoading);
  const smsLoadingMore = useInboxStore((s) => s.smsLoadingMore);
  const smsHasMore = useInboxStore((s) => s.smsHasMore);
  const fetchNextSmsPage = useInboxStore((s) => s.fetchNextSmsPage);
  const deleteSelectedSms = useInboxStore((s) => s.deleteSelectedSms);
  const markSelectedSmsRead = useInboxStore((s) => s.markSelectedSmsRead);
  const openSetupWithSegment = useInboxStore((s) => s.openSetupWithSegment);

  const observerTarget = useRef<HTMLDivElement>(null);
  const allLoadedSelected = smsList.length > 0 && smsSelectedIds.size === smsList.length;
  const anySelected = smsSelectedIds.size > 0;

  useEffect(() => {
    const el = observerTarget.current;
    if (!el || smsLoading || smsLoadingMore || !smsHasMore) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void fetchNextSmsPage();
        }
      },
      { threshold: 0.1 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [fetchNextSmsPage, smsLoading, smsLoadingMore, smsHasMore, smsList.length]);

  const handleDeleteSelected = async () => {
    const count = smsSelectedIds.size;
    if (count === 0) return;
    const ok = await confirmDialog({
      title: `Delete ${count} ${count === 1 ? "SMS message" : "SMS messages"}?`,
      description: "This will permanently remove the selected SMS messages.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (ok) {
      void deleteSelectedSms();
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Action Bar / Selection Header */}
      <div className="flex items-center justify-between border-b border-zinc-800/80 px-3 py-2 text-xs text-zinc-400">
        <div className="flex items-center gap-2">
          <button
            onClick={() => toggleSelectAllSmsLoaded()}
            title={allLoadedSelected ? "Deselect all" : "Select all loaded"}
            className="flex h-5 w-5 items-center justify-center rounded border border-zinc-700 hover:border-zinc-500"
          >
            {allLoadedSelected && <CheckIcon width={12} height={12} className="text-indigo-400" />}
          </button>
          <span>
            {anySelected ? `${smsSelectedIds.size} selected` : `${smsTotal} ${smsTotal === 1 ? "SMS" : "SMS messages"}`}
          </span>
        </div>

        {anySelected && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => void markSelectedSmsRead(true)}
              className={btn.ghost}
              title="Mark selected as read"
            >
              <MailReadIcon width={14} height={14} />
            </button>
            <button
              onClick={() => void handleDeleteSelected()}
              className={`${btn.ghost} text-red-400 hover:bg-red-500/10 hover:text-red-300`}
              title="Delete selected"
            >
              <TrashIcon width={14} height={14} />
            </button>
          </div>
        )}
      </div>

      {/* List Body */}
      <div className="flex-1 overflow-y-auto divide-y divide-zinc-800/50">
        {smsLoading && smsList.length === 0 ? (
          <div className="space-y-3 p-3">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="animate-pulse space-y-2 rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-3.5"
              >
                <div className="flex justify-between">
                  <div className="h-3.5 w-24 rounded bg-zinc-800" />
                  <div className="h-3 w-12 rounded bg-zinc-800/60" />
                </div>
                <div className="h-3 w-36 rounded bg-zinc-800/80" />
                <div className="h-3 w-full rounded bg-zinc-800/50" />
              </div>
            ))}
          </div>
        ) : smsList.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-900 text-zinc-600 ring-1 ring-zinc-800">
              <PhoneIcon width={22} height={22} />
            </div>
            <p className="text-sm font-semibold text-zinc-300">No SMS messages found</p>
            <p className="mt-1 max-w-xs text-xs leading-relaxed text-zinc-500">
              Post to <code className="font-mono text-[11px] text-emerald-400">/api/sms</code> or send a test SMS from Setup to get started.
            </p>
            <button
              onClick={() => openSetupWithSegment("sms")}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-all hover:border-zinc-700 hover:bg-zinc-800 hover:text-zinc-100"
            >
              Send test SMS
            </button>
          </div>
        ) : (
          smsList.map((sms) => {
            const isSelected = sms.id === smsSelectedId;
            const isChecked = smsSelectedIds.has(sms.id);

            return (
              <div
                key={sms.id}
                onClick={() => setSmsSelectedId(sms.id)}
                className={`group relative flex cursor-pointer items-start gap-3 p-3.5 transition-colors ${
                  isSelected ? "bg-indigo-950/40 text-zinc-100" : "hover:bg-zinc-900/60 text-zinc-300"
                } ${!sms.read ? "font-medium" : ""}`}
              >
                {!sms.read && (
                  <span className="absolute left-1.5 top-5 h-2 w-2 rounded-full bg-indigo-500" />
                )}

                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={(e) => {
                    e.stopPropagation();
                    toggleSmsSelected(sms.id);
                  }}
                  className="mt-1 rounded border-zinc-700 bg-zinc-900 text-indigo-600 focus:ring-0"
                />

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-semibold text-zinc-200">
                      {sms.from}
                    </span>
                    <span className="shrink-0 text-[10px] text-zinc-500">
                      {formatTime(sms.received_at)}
                    </span>
                  </div>

                  <div className="mt-0.5 truncate text-xs text-zinc-400">
                    To: {sms.to}
                  </div>

                  <p className="mt-1 line-clamp-2 text-xs text-zinc-400">
                    {sms.body || "(empty SMS)"}
                  </p>
                </div>
              </div>
            );
          })
        )}

        {smsHasMore && (
          <div ref={observerTarget} className="p-4 text-center text-xs text-zinc-500">
            {smsLoadingMore ? "Loading more…" : ""}
          </div>
        )}
      </div>
    </div>
  );
}

function formatTime(iso: string): string {
  try {
    const date = new Date(iso);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) {
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}
