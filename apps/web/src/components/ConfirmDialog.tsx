import { useEffect } from "react";
import { resolveConfirmDialog, useConfirmStore } from "../confirmStore";
import { btn, card } from "../ui";

/** Single global confirmation dialog — mount once at the app root. */
export function ConfirmDialog() {
  const { open, title, description, confirmLabel, cancelLabel, danger } = useConfirmStore();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") resolveConfirmDialog(false);
      if (e.key === "Enter") resolveConfirmDialog(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={() => resolveConfirmDialog(false)}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className={`${card} w-full max-w-sm p-5`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-dialog-title" className="text-sm font-semibold text-zinc-100">
          {title}
        </h2>
        {description && <p className="mt-2 text-sm text-zinc-400">{description}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={() => resolveConfirmDialog(false)} className={btn.secondary}>
            {cancelLabel}
          </button>
          <button
            onClick={() => resolveConfirmDialog(true)}
            className={danger ? btn.danger : btn.primary}
            autoFocus
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
