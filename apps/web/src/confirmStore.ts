import { create } from "zustand";

interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles the confirm button as destructive (red) instead of primary (indigo). */
  danger?: boolean;
}

interface ConfirmState extends Required<ConfirmOptions> {
  open: boolean;
  resolve: ((value: boolean) => void) | null;
}

const initial: ConfirmState = {
  open: false,
  title: "",
  description: "",
  confirmLabel: "Confirm",
  cancelLabel: "Cancel",
  danger: false,
  resolve: null,
};

export const useConfirmStore = create<ConfirmState>(() => initial);

/**
 * Imperative, promise-based replacement for `window.confirm()` that renders as the
 * app's own styled dialog: `if (await confirmDialog({ title: "Delete?" })) { ... }`.
 * A single `<ConfirmDialog />` mounted once (in App) renders whatever is requested.
 */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    useConfirmStore.setState({ ...initial, ...options, open: true, resolve });
  });
}

export function resolveConfirmDialog(result: boolean) {
  const { resolve } = useConfirmStore.getState();
  useConfirmStore.setState({ open: false, resolve: null });
  resolve?.(result);
}
