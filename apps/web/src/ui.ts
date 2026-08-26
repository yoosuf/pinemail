// Shared style tokens so every surface in the app draws from one consistent visual
// language instead of ad-hoc Tailwind strings scattered across components.

export const focusRing =
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950";

export const btnBase = `inline-flex items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-40 ${focusRing}`;

export const btn = {
  primary: `${btnBase} bg-indigo-500 px-3 py-1.5 text-white shadow-sm shadow-indigo-950/40 hover:bg-indigo-400`,
  secondary: `${btnBase} border border-zinc-800 bg-zinc-900/60 px-3 py-1.5 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-800 hover:text-zinc-100`,
  ghost: `${btnBase} px-2.5 py-1.5 text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-100`,
  danger: `${btnBase} border border-red-900/60 bg-red-950/30 px-3 py-1.5 text-red-400 hover:bg-red-950/60 hover:text-red-300`,
};

export const card = "rounded-xl border border-zinc-800 bg-zinc-900/50 shadow-sm shadow-black/20";

export const input = `w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 transition-colors ${focusRing}`;

export const badge = "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium";

export const AVATAR_PALETTE = [
  "bg-indigo-500/15 text-indigo-300",
  "bg-violet-500/15 text-violet-300",
  "bg-emerald-500/15 text-emerald-300",
  "bg-amber-500/15 text-amber-300",
  "bg-rose-500/15 text-rose-300",
  "bg-sky-500/15 text-sky-300",
  "bg-fuchsia-500/15 text-fuchsia-300",
];

/** Deterministic avatar color + initial derived from a "Name <email>" or bare email string. */
export function avatarFor(from: string): { initial: string; classes: string } {
  const name = from.replace(/<.*>/, "").trim() || from;
  const initial = (name[0] ?? "?").toUpperCase();
  let hash = 0;
  for (let i = 0; i < from.length; i++) hash = (hash * 31 + from.charCodeAt(i)) >>> 0;
  const classes = AVATAR_PALETTE[hash % AVATAR_PALETTE.length] ?? AVATAR_PALETTE[0]!;
  return { initial, classes };
}
