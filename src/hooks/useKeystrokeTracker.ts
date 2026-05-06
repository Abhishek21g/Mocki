import { useEffect, useRef } from "react";

type KeyEvent = { ts: number; k: string; t: 0 | 1 }; // t: 0=down, 1=up

export function useKeystrokeTracker(active: boolean) {
  const bufferRef = useRef<KeyEvent[]>([]);

  useEffect(() => {
    if (!active) return;
    const onDown = (e: KeyboardEvent) => {
      bufferRef.current.push({ ts: Date.now(), k: e.key, t: 0 });
    };
    const onUp = (e: KeyboardEvent) => {
      bufferRef.current.push({ ts: Date.now(), k: e.key, t: 1 });
    };
    document.addEventListener("keydown", onDown);
    document.addEventListener("keyup", onUp);
    return () => {
      document.removeEventListener("keydown", onDown);
      document.removeEventListener("keyup", onUp);
    };
  }, [active]);

  function getPayload() {
    return JSON.stringify(bufferRef.current);
  }

  return { getPayload };
}
