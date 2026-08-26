import type { MessageDetail, MessageList, ExtractedSignals, MessageAnalysis, ServerConfig, MessageSummary } from "./types";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export const api = {
  list(search: string, offset = 0, limit = 50): Promise<MessageList> {
    const params = new URLSearchParams({ offset: String(offset), limit: String(limit) });
    if (search) params.set("search", search);
    return fetch(`/api/messages?${params}`).then((r) => json(r));
  },

  get(id: string): Promise<MessageDetail> {
    return fetch(`/api/messages/${id}`).then((r) => json(r));
  },

  extract(id: string): Promise<ExtractedSignals> {
    return fetch(`/api/messages/${id}/extract`).then((r) => json(r));
  },

  analysis(id: string): Promise<MessageAnalysis> {
    return fetch(`/api/messages/${id}/analysis`).then((r) => json(r));
  },

  source(id: string): Promise<string> {
    return fetch(`/api/messages/${id}/raw`).then((r) => {
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      return r.text();
    });
  },

  markRead(id: string, read: boolean): Promise<void> {
    return fetch(`/api/messages/${id}/read`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ read }),
    }).then((r) => {
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    });
  },

  delete(id: string): Promise<void> {
    return fetch(`/api/messages/${id}`, { method: "DELETE" }).then((r) => {
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    });
  },

  bulkDelete(ids: string[]): Promise<void> {
    return fetch(`/api/messages/bulk-delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    }).then((r) => {
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    });
  },

  bulkMarkRead(ids: string[], read: boolean): Promise<void> {
    return fetch(`/api/messages/bulk-read`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, read }),
    }).then((r) => {
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    });
  },

  clear(): Promise<void> {
    return fetch(`/api/messages`, { method: "DELETE" }).then((r) => {
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    });
  },

  config(): Promise<ServerConfig> {
    return fetch(`/api/config`).then((r) => json(r));
  },

  sendTestEmail(to?: string): Promise<MessageSummary> {
    return fetch(`/api/test-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: to || undefined }),
    }).then((r) => json(r));
  },

  rawUrl(id: string): string {
    return `/api/messages/${id}/raw`;
  },

  htmlUrl(id: string): string {
    return `/api/messages/${id}/html`;
  },

  attachmentUrl(id: string, index: number): string {
    return `/api/messages/${id}/attachments/${index}`;
  },
};
