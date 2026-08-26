import { memo, useEffect, useRef } from "react";
import { confirmDialog } from "../confirmStore";
import { useInboxStore } from "../store";
import { avatarFor, btn } from "../ui";
import { InboxIcon, TrashIcon } from "./Icons";
import type { MessageSummary } from "../types";

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Memoized so selecting/checking a message only re-renders the (at most two) rows
// whose state actually changed, not every row in the list.
const MessageRow = memo(function MessageRow({
  message,
  isActive,
  isChecked,
  onOpen,
  onToggleCheck,
}: {
  message: MessageSummary;
  isActive: boolean;
  isChecked: boolean;
  onOpen: (id: string) => void;
  onToggleCheck: (id: string) => void;
}) {
  const avatar = avatarFor(message.from);
  return (
    <li className="px-2 py-0.5">
      <div
        className={`flex items-start gap-2 rounded-lg px-2 py-2.5 transition-colors ${
          isActive ? "bg-zinc-900 ring-1 ring-inset ring-indigo-500/40" : "hover:bg-zinc-900/60"
        }`}
      >
        <input
          type="checkbox"
          checked={isChecked}
          onChange={() => onToggleCheck(message.id)}
          className="mt-2 h-3.5 w-3.5 shrink-0 cursor-pointer rounded border-zinc-700 bg-zinc-950 accent-indigo-500"
          aria-label={`Select ${message.subject || "message"}`}
        />
        <button onClick={() => onOpen(message.id)} className="flex min-w-0 flex-1 items-start gap-2.5 text-left">
          <span
            className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${avatar.classes}`}
          >
            {avatar.initial}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center justify-between gap-2">
              <span
                className={`truncate text-sm ${message.read ? "text-zinc-400" : "font-semibold text-zinc-100"}`}
              >
                {message.subject || "(no subject)"}
              </span>
              {!message.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" />}
            </span>
            <span className="mt-0.5 block truncate text-xs text-zinc-500">{message.from}</span>
            <span className="mt-1 flex items-center justify-between text-[11px] text-zinc-600">
              <span>{formatTime(message.received_at)}</span>
              <span>{Math.max(1, Math.round(message.size / 1024))} KB</span>
            </span>
          </span>
        </button>
      </div>
    </li>
  );
});

export function MessageList() {
  const messages = useInboxStore((s) => s.messages);
  const total = useInboxStore((s) => s.total);
  const loading = useInboxStore((s) => s.loading);
  const hasMore = useInboxStore((s) => s.hasMore);
  const loadingMore = useInboxStore((s) => s.loadingMore);
  const fetchNextPage = useInboxStore((s) => s.fetchNextPage);
  const selectedId = useInboxStore((s) => s.selectedId);
  const setSelectedId = useInboxStore((s) => s.setSelectedId);
  const selectedIds = useInboxStore((s) => s.selectedIds);
  const toggleSelected = useInboxStore((s) => s.toggleSelected);
  const toggleSelectAllLoaded = useInboxStore((s) => s.toggleSelectAllLoaded);
  const clearSelection = useInboxStore((s) => s.clearSelection);
  const deleteSelected = useInboxStore((s) => s.deleteSelected);
  const markSelectedRead = useInboxStore((s) => s.markSelectedRead);

  // Infinite scroll: only ever pull in one PAGE_SIZE-sized batch at a time, driven
  // by this sentinel entering the viewport, instead of loading the whole inbox up front.
  const sentinelRef = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void fetchNextPage();
      },
      { rootMargin: "300px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [fetchNextPage, messages.length]);

  if (messages.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-900 text-zinc-600 ring-1 ring-zinc-800">
          <InboxIcon width={22} height={22} />
        </div>
        <p className="text-sm text-zinc-500">
          {loading ? "Loading…" : "No messages yet — send an email to this catcher to see it here."}
        </p>
      </div>
    );
  }

  const allLoadedSelected = selectedIds.size > 0 && selectedIds.size === messages.length;

  async function handleBulkDelete() {
    const count = selectedIds.size;
    const ok = await confirmDialog({
      title: `Delete ${count} selected message${count === 1 ? "" : "s"}?`,
      description: "This can't be undone.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    await deleteSelected();
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-zinc-900 px-3 py-2">
        <input
          type="checkbox"
          checked={allLoadedSelected}
          onChange={toggleSelectAllLoaded}
          className="h-3.5 w-3.5 shrink-0 cursor-pointer rounded border-zinc-700 bg-zinc-950 accent-indigo-500"
          aria-label="Select all loaded messages"
        />
        {selectedIds.size > 0 ? (
          <>
            <span className="text-xs text-zinc-400">{selectedIds.size} selected</span>
            <div className="ml-auto flex items-center gap-1">
              <button onClick={() => markSelectedRead(true)} className={btn.ghost}>
                Mark read
              </button>
              <button onClick={() => markSelectedRead(false)} className={btn.ghost}>
                Mark unread
              </button>
              <button onClick={handleBulkDelete} className={`${btn.danger} px-2 py-1`}>
                <TrashIcon />
                Delete
              </button>
              <button onClick={clearSelection} className={btn.ghost}>
                Cancel
              </button>
            </div>
          </>
        ) : (
          <span className="text-xs text-zinc-600">{total} total</span>
        )}
      </div>

      <ul className="flex-1 divide-y divide-zinc-900/60 overflow-y-auto py-1">
        {messages.map((m) => (
          <MessageRow
            key={m.id}
            message={m}
            isActive={selectedId === m.id}
            isChecked={selectedIds.has(m.id)}
            onOpen={setSelectedId}
            onToggleCheck={toggleSelected}
          />
        ))}
        <li ref={sentinelRef} aria-hidden />
        {loadingMore && (
          <li className="py-3 text-center text-xs text-zinc-600">Loading more…</li>
        )}
        {!hasMore && (
          <li className="py-3 text-center text-[11px] text-zinc-700">End of inbox</li>
        )}
      </ul>
    </div>
  );
}

