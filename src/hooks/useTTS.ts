import { useEffect, useRef, useState } from "react";
import { showToast } from "@/components/ghost/Toaster";
import { createTtsController, type TtsController, type TtsStatus } from "@/lib/tts";

const TTS_ENABLED_STORAGE_KEY = "mocki:ttsEnabled";

export function useTTS(ttsProxyUrl: string) {
  const ttsRef = useRef<TtsController | null>(null);
  const [ttsStatus, setTtsStatus] = useState<TtsStatus>("idle");
  const [ttsEnabled, setTtsEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const stored = window.localStorage.getItem(TTS_ENABLED_STORAGE_KEY);
    return stored === null ? true : stored === "true";
  });

  useEffect(() => {
    const tts = createTtsController({
      proxyUrl: ttsProxyUrl,
      onStatus: setTtsStatus,
      onError: (message) => showToast(message),
    });
    ttsRef.current = tts;
    return () => {
      tts.destroy();
      ttsRef.current = null;
    };
  }, [ttsProxyUrl]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(TTS_ENABLED_STORAGE_KEY, String(ttsEnabled));
  }, [ttsEnabled]);

  return { ttsRef, ttsStatus, ttsEnabled, setTtsEnabled };
}
