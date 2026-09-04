import { create } from "zustand";
import { api } from "./api";
import type { MessageSummary, ServerEvent, SmsMessage } from "./types";

const PAGE_SIZE = 50;

export type ActiveTab = "emails" | "sms";

export interface CategoryItem {
  id: string;
  read?: boolean;
}

export interface SliceState<T extends CategoryItem> {
  items: T[];
  total: number;
  search: string;
  selectedId: string | null;
  selectedIds: Set<string>;
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
}

function createInitialSlice<T extends CategoryItem>(): SliceState<T> {
  return {
    items: [],
    total: 0,
    search: "",
    selectedId: null,
    selectedIds: new Set(),
    hasMore: true,
    loading: true,
    loadingMore: false,
  };
}

interface CategoryAdapter<T extends CategoryItem> {
  list: (search: string, offset?: number, limit?: number) => Promise<{ messages: T[]; total: number }>;
  bulkDelete: (ids: string[]) => Promise<void>;
  bulkMarkRead: (ids: string[], read: boolean) => Promise<void>;
}

const categoryAdapters: Record<ActiveTab, CategoryAdapter<any>> = {
  emails: {
    list: (s, o, l) => api.list(s, o, l),
    bulkDelete: (ids) => api.bulkDelete(ids),
    bulkMarkRead: (ids, read) => api.bulkMarkRead(ids, read),
  },
  sms: {
    list: (s, o, l) => api.listSms(s, o, l),
    bulkDelete: (ids) => api.bulkDeleteSms(ids),
    bulkMarkRead: (ids, read) => api.bulkMarkSmsRead(ids, read),
  },
};

type SliceEventAction =
  | { category: ActiveTab; kind: "new"; payload: any }
  | { category: ActiveTab; kind: "deleted"; payload: string }
  | { category: ActiveTab; kind: "bulk_deleted"; payload: string[] }
  | { category: ActiveTab; kind: "cleared"; payload: null }
  | { category: ActiveTab; kind: "read"; payload: { id: string; read: boolean } }
  | { category: ActiveTab; kind: "bulk_read"; payload: { ids: string[]; read: boolean } };

function parseServerEvent(event: ServerEvent): SliceEventAction | null {
  switch (event.type) {
    // Email events
    case "new":
      return { category: "emails", kind: "new", payload: event };
    case "deleted":
      return { category: "emails", kind: "deleted", payload: event.id };
    case "bulk_deleted":
      return { category: "emails", kind: "bulk_deleted", payload: event.ids };
    case "cleared":
      return { category: "emails", kind: "cleared", payload: null };
    case "read":
      return { category: "emails", kind: "read", payload: { id: event.id, read: event.read } };
    case "bulk_read":
      return { category: "emails", kind: "bulk_read", payload: { ids: event.ids, read: event.read } };

    // SMS events
    case "new_sms":
      return { category: "sms", kind: "new", payload: event };
    case "sms_deleted":
      return { category: "sms", kind: "deleted", payload: event.id };
    case "bulk_sms_deleted":
      return { category: "sms", kind: "bulk_deleted", payload: event.ids };
    case "sms_cleared":
      return { category: "sms", kind: "cleared", payload: null };
    case "sms_read":
      return { category: "sms", kind: "read", payload: { id: event.id, read: event.read } };
    case "bulk_sms_read":
      return { category: "sms", kind: "bulk_read", payload: { ids: event.ids, read: event.read } };

    default:
      return null;
  }
}

const sliceReducers = {
  new: <T extends CategoryItem>(s: SliceState<T>, item: T): SliceState<T> => {
    if (s.items.some((m) => m.id === item.id)) return s;
    return {
      ...s,
      items: [item, ...s.items],
      total: s.total + 1,
    };
  },

  deleted: <T extends CategoryItem>(s: SliceState<T>, id: string): SliceState<T> => ({
    ...s,
    items: s.items.filter((m) => m.id !== id),
    total: Math.max(0, s.total - 1),
    selectedId: s.selectedId === id ? null : s.selectedId,
  }),

  bulk_deleted: <T extends CategoryItem>(s: SliceState<T>, ids: string[]): SliceState<T> => {
    const idSet = new Set(ids);
    return {
      ...s,
      items: s.items.filter((m) => !idSet.has(m.id)),
      total: Math.max(0, s.total - ids.length),
      selectedId: s.selectedId && idSet.has(s.selectedId) ? null : s.selectedId,
    };
  },

  cleared: <T extends CategoryItem>(s: SliceState<T>): SliceState<T> => ({
    ...s,
    items: [],
    total: 0,
    selectedId: null,
    selectedIds: new Set(),
  }),

  read: <T extends CategoryItem>(s: SliceState<T>, { id, read }: { id: string; read: boolean }): SliceState<T> => ({
    ...s,
    items: s.items.map((m) => (m.id === id ? { ...m, read } : m)),
  }),

  bulk_read: <T extends CategoryItem>(s: SliceState<T>, { ids, read }: { ids: string[]; read: boolean }): SliceState<T> => {
    const idSet = new Set(ids);
    return {
      ...s,
      items: s.items.map((m) => (idSet.has(m.id) ? { ...m, read } : m)),
    };
  },
};

interface InboxState {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;

  // Category Slices
  emails: SliceState<MessageSummary>;
  sms: SliceState<SmsMessage>;

  // Polymorphic Slice Operations
  setCategorySearch: (category: ActiveTab, search: string) => void;
  setCategorySelectedId: (category: ActiveTab, id: string | null) => void;
  toggleCategorySelected: (category: ActiveTab, id: string) => void;
  toggleSelectAllCategoryLoaded: (category: ActiveTab) => void;
  clearCategorySelection: (category: ActiveTab) => void;
  fetchFirstCategoryPage: (category: ActiveTab) => Promise<void>;
  fetchNextCategoryPage: (category: ActiveTab) => Promise<void>;
  deleteSelectedCategory: (category: ActiveTab) => Promise<void>;
  markSelectedCategoryRead: (category: ActiveTab, read: boolean) => Promise<void>;

  // Backward-compatible Email getters/actions
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

  // Backward-compatible SMS getters/actions
  smsList: SmsMessage[];
  smsTotal: number;
  smsSearch: string;
  smsSelectedId: string | null;
  smsSelectedIds: Set<string>;
  smsHasMore: boolean;
  smsLoading: boolean;
  smsLoadingMore: boolean;

  setSmsSearch: (search: string) => void;
  setSmsSelectedId: (id: string | null) => void;
  toggleSmsSelected: (id: string) => void;
  toggleSelectAllSmsLoaded: () => void;
  clearSmsSelection: () => void;
  fetchFirstSmsPage: () => Promise<void>;
  fetchNextSmsPage: () => Promise<void>;
  deleteSelectedSms: () => Promise<void>;
  markSelectedSmsRead: (read: boolean) => Promise<void>;

  // Setup Panel Drawer & Segment Store State
  setupOpen: boolean;
  setupSegment: "email" | "sms";
  setSetupOpen: (open: boolean) => void;
  setSetupSegment: (segment: "email" | "sms") => void;
  openSetupWithSegment: (segment: "email" | "sms") => void;

  // Server Event Handler
  applyEvent: (event: ServerEvent) => void;
}

export const useInboxStore = create<InboxState>((set, get) => {
  const syncDerivedState = (state: Partial<InboxState>): Partial<InboxState> => {
    const derived: Partial<InboxState> = { ...state };

    if (state.emails) {
      derived.messages = state.emails.items;
      derived.total = state.emails.total;
      derived.search = state.emails.search;
      derived.selectedId = state.emails.selectedId;
      derived.selectedIds = state.emails.selectedIds;
      derived.hasMore = state.emails.hasMore;
      derived.loading = state.emails.loading;
      derived.loadingMore = state.emails.loadingMore;
    }

    if (state.sms) {
      derived.smsList = state.sms.items;
      derived.smsTotal = state.sms.total;
      derived.smsSearch = state.sms.search;
      derived.smsSelectedId = state.sms.selectedId;
      derived.smsSelectedIds = state.sms.selectedIds;
      derived.smsHasMore = state.sms.hasMore;
      derived.smsLoading = state.sms.loading;
      derived.smsLoadingMore = state.sms.loadingMore;
    }

    return derived;
  };


  const updateCategorySlice = (
    category: ActiveTab,
    updater: (prev: SliceState<any>) => SliceState<any>
  ) => {
    set((state) => {
      const prevSlice = state[category];
      const nextSlice = updater(prevSlice);
      return syncDerivedState({ [category]: nextSlice });
    });
  };

  return {
    activeTab: "emails",

    emails: createInitialSlice<MessageSummary>(),
    sms: createInitialSlice<SmsMessage>(),

    // Backward-compatible properties initialized
    messages: [],
    total: 0,
    search: "",
    selectedId: null,
    selectedIds: new Set(),
    hasMore: true,
    loading: true,
    loadingMore: false,

    smsList: [],
    smsTotal: 0,
    smsSearch: "",
    smsSelectedId: null,
    smsSelectedIds: new Set(),
    smsHasMore: true,
    smsLoading: true,
    smsLoadingMore: false,

    setActiveTab: (tab) => {
      set({ activeTab: tab });
      void get().fetchFirstCategoryPage(tab);
    },

    // --- Polymorphic Category Operations ---

    setCategorySearch: (category, search) => {
      updateCategorySlice(category, (s) => ({ ...s, search }));
      void get().fetchFirstCategoryPage(category);
    },

    setCategorySelectedId: (category, selectedId) => {
      updateCategorySlice(category, (s) => ({ ...s, selectedId }));
    },

    toggleCategorySelected: (category, id) => {
      updateCategorySlice(category, (s) => {
        const next = new Set(s.selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return { ...s, selectedIds: next };
      });
    },

    toggleSelectAllCategoryLoaded: (category) => {
      updateCategorySlice(category, (s) => {
        const allSelected = s.items.length > 0 && s.selectedIds.size === s.items.length;
        return {
          ...s,
          selectedIds: allSelected ? new Set() : new Set(s.items.map((m) => m.id)),
        };
      });
    },

    clearCategorySelection: (category) => {
      updateCategorySlice(category, (s) => ({ ...s, selectedIds: new Set() }));
    },

    fetchFirstCategoryPage: async (category) => {
      const slice = get()[category];
      const adapter = categoryAdapters[category];
      updateCategorySlice(category, (s) => ({ ...s, loading: true }));
      try {
        const res = await adapter.list(slice.search, 0, PAGE_SIZE);
        updateCategorySlice(category, (s) => {
          const seen = new Set<string>();
          const unique = res.messages.filter((m) => {
            if (seen.has(m.id)) return false;
            seen.add(m.id);
            return true;
          });
          return {
            ...s,
            items: unique,
            total: res.total,
            hasMore: unique.length < res.total,
            selectedIds: new Set(),
          };
        });
      } finally {
        updateCategorySlice(category, (s) => ({ ...s, loading: false }));
      }
    },

    fetchNextCategoryPage: async (category) => {
      const slice = get()[category];
      if (slice.loading || slice.loadingMore || !slice.hasMore) return;
      const adapter = categoryAdapters[category];
      updateCategorySlice(category, (s) => ({ ...s, loadingMore: true }));
      try {
        const res = await adapter.list(slice.search, slice.items.length, PAGE_SIZE);
        updateCategorySlice(category, (s) => {
          const existingIds = new Set(s.items.map((m) => m.id));
          const newItems = res.messages.filter((m) => !existingIds.has(m.id));
          return {
            ...s,
            items: [...s.items, ...newItems],
            total: res.total,
            hasMore: s.items.length + newItems.length < res.total,
          };
        });
      } finally {
        updateCategorySlice(category, (s) => ({ ...s, loadingMore: false }));
      }
    },

    deleteSelectedCategory: async (category) => {
      const slice = get()[category];
      const ids = Array.from(slice.selectedIds);
      if (ids.length === 0) return;
      const adapter = categoryAdapters[category];
      await adapter.bulkDelete(ids);
      const idSet = new Set(ids);
      updateCategorySlice(category, (s) => ({
        ...s,
        selectedIds: new Set(),
        selectedId: s.selectedId && idSet.has(s.selectedId) ? null : s.selectedId,
      }));
    },

    markSelectedCategoryRead: async (category, read) => {
      const slice = get()[category];
      const ids = Array.from(slice.selectedIds);
      if (ids.length === 0) return;
      const adapter = categoryAdapters[category];
      await adapter.bulkMarkRead(ids, read);
      updateCategorySlice(category, (s) => ({ ...s, selectedIds: new Set() }));
    },

    // --- Backward Compatible Email Actions ---
    setSearch: (search) => get().setCategorySearch("emails", search),
    setSelectedId: (id) => get().setCategorySelectedId("emails", id),
    toggleSelected: (id) => get().toggleCategorySelected("emails", id),
    toggleSelectAllLoaded: () => get().toggleSelectAllCategoryLoaded("emails"),
    clearSelection: () => get().clearCategorySelection("emails"),
    fetchFirstPage: () => get().fetchFirstCategoryPage("emails"),
    fetchNextPage: () => get().fetchNextCategoryPage("emails"),
    deleteSelected: () => get().deleteSelectedCategory("emails"),
    markSelectedRead: (read) => get().markSelectedCategoryRead("emails", read),

    // --- Backward Compatible SMS Actions ---
    setSmsSearch: (search) => get().setCategorySearch("sms", search),
    setSmsSelectedId: (id) => get().setCategorySelectedId("sms", id),
    toggleSmsSelected: (id) => get().toggleCategorySelected("sms", id),
    toggleSelectAllSmsLoaded: () => get().toggleSelectAllCategoryLoaded("sms"),
    clearSmsSelection: () => get().clearCategorySelection("sms"),
    fetchFirstSmsPage: () => get().fetchFirstCategoryPage("sms"),
    fetchNextSmsPage: () => get().fetchNextCategoryPage("sms"),
    deleteSelectedSms: () => get().deleteSelectedCategory("sms"),
    markSelectedSmsRead: (read) => get().markSelectedCategoryRead("sms", read),

    // --- Setup Panel Drawer Store Management ---
    setupOpen: false,
    setupSegment: "email",
    setSetupOpen: (setupOpen) => set({ setupOpen }),
    setSetupSegment: (setupSegment) => set({ setupSegment }),
    openSetupWithSegment: (segment) => set({ setupOpen: true, setupSegment: segment }),

    // --- Declarative Server Event Handler ---
    applyEvent: (event) => {
      const action = parseServerEvent(event);
      if (!action) return;

      updateCategorySlice(action.category, (slice) => {
        switch (action.kind) {
          case "new":
            return sliceReducers.new(slice, action.payload);
          case "deleted":
            return sliceReducers.deleted(slice, action.payload);
          case "bulk_deleted":
            return sliceReducers.bulk_deleted(slice, action.payload);
          case "cleared":
            return sliceReducers.cleared(slice);
          case "read":
            return sliceReducers.read(slice, action.payload);
          case "bulk_read":
            return sliceReducers.bulk_read(slice, action.payload);
        }
      });
    },
  };
});
