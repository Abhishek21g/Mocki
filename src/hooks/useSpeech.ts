import { useEffect, useRef, useState } from "react";
import { showToast } from "@/components/ghost/Toaster";
import {
  createSpeechRecognitionController,
  type SpeechEngine,
} from "@/lib/speech";

export function useSpeech(
  sttProxyUrl: string | undefined,
  setAnswer: (updater: (prev: string) => string) => void,
  setInterimTranscript: (value: string) => void,
  setIsHoldingTalk: (value: boolean) => void,
) {
  const recognitionRef = useRef<ReturnType<typeof createSpeechRecognitionController> | null>(null);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [sttEngine, setSttEngine] = useState<SpeechEngine | null>(null);

  useEffect(() => {
    const recognition = createSpeechRecognitionController({
      proxyUrl: sttProxyUrl,
      onStatus: () => {},
      onPartial: setInterimTranscript,
      onFinal: (text) =>
        setAnswer((prev) => {
          const prefix = prev.trim();
          return prefix ? `${prefix} ${text}` : text;
        }),
      onError: (message) => {
        showToast(message);
        setIsHoldingTalk(false);
      },
    });
    recognitionRef.current = recognition;
    setSpeechSupported(recognition.supported);
    setSttEngine(recognition.engine);

    return () => {
      recognition.destroy();
      recognitionRef.current = null;
    };
  }, [sttProxyUrl, setAnswer, setInterimTranscript, setIsHoldingTalk]);

  return { recognitionRef, speechSupported, sttEngine, setSpeechSupported };
}
