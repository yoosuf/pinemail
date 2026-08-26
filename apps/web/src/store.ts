import { create } from "zustand";
import { api } from "./api";
import type { MessageSummary, ServerEvent } from "./types";

// Keep pages small: bounds both the payload size per request and how many rows
// ever sit in memory/DOM at once, however large the underlying inbox grows.
const PAGE_SIZE = 50;

interface InboxState {
  messages: MessageSummary[];
  total: number;
  search: string;
  selectedId: string | null;
  selectedIds: Set<string>;
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;

  setSearch: (search: string) => void;
  setSelectedId: (id: string | null) => void;
  toggleSelected: (id: string) => void;
  toggleSelectAllLoaded: () => void;
  clearSelection: () => void;

  fetchFirstPage: () => Promise<void>;
  fetchNextPage: () => Promise<void>;

  deleteSelected: () => Promise<void>;
  markSelectedRead: (read: boolean) => Promise<void>;

  applyEvent: (event: ServerEvent) => void;
}

// Single global store for the inbox: components subscribe to just the slice they
// need via selectors, so e.g. selecting a message only re-renders the row that
// changed instead of the whole list/app tree (unlike prop-drilled useState).
export const useInboxStore = create<InboxState>((set, get) => ({
  messages: [],
  total: 0,
  search: "",
  selectedId: null,
  selectedIds: new Set(),
  hasMore: true,
  loading: false,
  loadingMore: false,

  setSearch: (search) => {
    set({ search });
    void get().fetchFirstPage();
  },
  setSelectedId: (selectedId) => set({ selectedId }),

  toggleSelected: (id) =>
    set((s) => {
      const next = new Set(s.selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { selectedIds: next };
    }),

  toggleSelectAllLoaded: () =>
    set((s) => {
      const allLoadedSelected = s.messages.length > 0 && s.selectedIds.size === s.messages.length;
      return { selectedIds: allLoadedSelected ? new Set() : new Set(s.messages.map((m) => m.id)) };
    }),

  clearSelection: () => set({ selectedIds: new Set() }),

  // Loads (or reloads, on search change) page 1. Replaces the list rather than
  // appending, since the query itself changed.
  fetchFirstPage: async () => {
    const { search } = get();
    set({ loading: true });
    try {
      const res = await api.list(search, 0, PAGE_SIZE);
      set({
        messages: res.messages,
        total: res.total,
        hasMore: res.messages.length < res.total,
        selectedIds: new Set(),
      });
    } finally {
      set({ loading: false });
    }
  },

  // Appends the next page — this is what the infinite-scroll sentinel calls.
  fetchNextPage: async () => {
    const { search, messages, loadingMore, hasMore } = get();
    if (loadingMore || !hasMore) return;
    set({ loadingMore: true });
    try {
      const res = await api.list(search, messages.length, PAGE_SIZE);
      set((s) => ({
        messages: [...s.messages, ...res.messages],
        total: res.total,
        hasMore: s.messages.length + res.messages.length < res.total,
      }));
    } finally {
      set({ loadingMore: false });
    }
  },

  // Note: these intentionally don't touch `messages`/`total` themselves — the
  // server broadcasts a `bulk_deleted`/`bulk_read` event back over the websocket
  // (to every client, including this one) which `applyEvent` applies exactly once.
  // Updating state here too would double-count for the client that triggered it.
  deleteSelected: async () => {
    const ids = Array.from(get().selectedIds);
    if (ids.length === 0) return;
    await api.bulkDelete(ids);
    const idSet = new Set(ids);
    set((s) => ({
      selectedIds: new Set(),
      selectedId: s.selectedId && idSet.has(s.selectedId) ? null : s.selectedId,
    }));
  },

  markSelectedRead: async (read) => {
    const ids = Array.from(get().selectedIds);
    if (ids.length === 0) return;
    await api.bulkMarkRead(ids, read);
    set({ selectedIds: new Set() });
  },

  applyEvent: (event) =>
    set((state) => {
      switch (event.type) {
        case "new":
          return { messages: [event, ...state.messages], total: state.total + 1 };
        case "deleted":
          return {
            messages: state.messages.filter((m) => m.id !== event.id),
            total: Math.max(0, state.total - 1),
            selectedId: state.selectedId === event.id ? null : state.selectedId,
          };
        case "bulk_deleted": {
          const idSet = new Set(event.ids);
          return {
            messages: state.messages.filter((m) => !idSet.has(m.id)),
            total: Math.max(0, state.total - event.ids.length),
            selectedId: state.selectedId && idSet.has(state.selectedId) ? null : state.selectedId,
          };
        }
        case "cleared":
          return { messages: [], total: 0, selectedId: null, selectedIds: new Set() };
        case "read":
          return {
            messages: state.messages.map((m) => (m.id === event.id ? { ...m, read: event.read } : m)),
          };
        case "bulk_read": {
          const idSet = new Set(event.ids);
          return {
            messages: state.messages.map((m) => (idSet.has(m.id) ? { ...m, read: event.read } : m)),
          };
        }
        default:
          return state;
      }
    }),
}));
