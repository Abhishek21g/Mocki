import { useEffect, useState } from "react";

type Toast = { id: number; message: string };
let id = 0;
const listeners = new Set<(t: Toast[]) => void>();
let toasts: Toast[] = [];

export function showToast(message: string) {
  const t = { id: ++id, message };
  toasts = [...toasts, t];
  listeners.forEach((l) => l(toasts));
  setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== t.id);
    listeners.forEach((l) => l(toasts));
  }, 5000);
}

export function Toaster() {
  const [list, setList] = useState<Toast[]>([]);
  useEffect(() => {
    listeners.add(setList);
    return () => {
      listeners.delete(setList);
    };
  }, []);
  if (!list.length) return null;
  return (
    <div className="fixed bottom-6 left-1/2 z-[9999] flex -translate-x-1/2 flex-col gap-2">
      {list.map((t) => (
        <div
          key={t.id}
          style={{ animation: "slide-up-toast 0.3s ease forwards" }}
          className="flex items-center gap-3 rounded-lg border border-red-500/40 bg-red-500/15 px-5 py-3 text-sm text-white backdrop-blur-md"
        >
          <span>⚠️</span>
          <span>{t.message}</span>
          <button
            onClick={() => {
              toasts = toasts.filter((x) => x.id !== t.id);
              listeners.forEach((l) => l(toasts));
            }}
            className="ml-2 text-white/60 hover:text-white"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
