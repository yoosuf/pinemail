import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { MailIcon, PlugIcon, RefreshIcon, SearchIcon } from "./components/Icons";
import { MessageList } from "./components/MessageList";
import { MessageView } from "./components/MessageView";
import { SetupPanel } from "./components/SetupPanel";
import { btn } from "./ui";
import { useInboxStore } from "./store";
import { useServerEvents } from "./useServerEvents";

export default function App() {
  const [inputValue, setInputValue] = useState("");
  const total = useInboxStore((s) => s.total);
  const setSearch = useInboxStore((s) => s.setSearch);
  const fetchFirstPage = useInboxStore((s) => s.fetchFirstPage);
  const loading = useInboxStore((s) => s.loading);
  const applyEvent = useInboxStore((s) => s.applyEvent);
  const [setupOpen, setSetupOpen] = useState(false);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      void setSearch(inputValue); // initial load, no need to debounce
      return;
    }
    const handle = setTimeout(() => setSearch(inputValue), 200);
    return () => clearTimeout(handle);
  }, [inputValue, setSearch]);

  useServerEvents(applyEvent);

  return (
    <div className="flex h-screen flex-col bg-zinc-950">
      <header className="flex items-center gap-3 border-b border-zinc-800/80 bg-zinc-950/95 px-4 py-3 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm shadow-indigo-950/50">
            <MailIcon width={15} height={15} />
          </div>
          <h1 className="text-sm font-semibold tracking-tight text-zinc-100">Pine Mail</h1>
        </div>

        <div className="relative w-72">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600" />
          <input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Search from, to, subject…"
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900/70 py-1.5 pl-8 pr-3 text-sm text-zinc-200 placeholder-zinc-600 transition-colors focus:border-indigo-500/60 focus:outline-none"
          />
        </div>

        <span className="rounded-full bg-zinc-900 px-2.5 py-1 text-xs font-medium text-zinc-500 ring-1 ring-inset ring-zinc-800">
          {total} {total === 1 ? "message" : "messages"}
        </span>

        <div className="flex-1" />

        <button onClick={() => setSetupOpen(true)} className={btn.secondary}>
          <PlugIcon />
          Setup
        </button>
        <button onClick={() => fetchFirstPage()} disabled={loading} className={btn.secondary}>
          <RefreshIcon className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-96 shrink-0 border-r border-zinc-800/80 bg-zinc-950">
          <MessageList />
        </div>
        <div className="flex-1 overflow-hidden bg-zinc-950">
          <MessageView />
        </div>
      </div>

      {setupOpen && <SetupPanel onClose={() => setSetupOpen(false)} />}
      <ConfirmDialog />
    </div>
  );
}
