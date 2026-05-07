import { useCallback, useRef } from "react";

const FILLER_WORDS: Array<[string, RegExp]> = [
  ["um", /\bum+\b/gi],
  ["uh", /\buh+\b/gi],
  ["like", /\blike\b/gi],
  ["you_know", /\byou know\b/gi],
  ["basically", /\bbasically\b/gi],
  ["literally", /\bliterally\b/gi],
  ["actually", /\bactually\b/gi],
  ["right", /\bright[?,.]?\s/gi],
  ["i_mean", /\bi mean\b/gi],
];

const SILENCE_THRESHOLD = 0.012;
const SILENCE_MIN_MS = 800;

export type QuestionMicData = {
  questionIndex: number;
  wpm: number;
  fillerWords: Record<string, number>;
  fillerWordTotal: number;
  fillerWordRate: number;
  avgVolume: number;
  maxVolume: number;
  silencePeriods: number;
  totalSilenceMs: number;
  speakingTimeMs: number;
  transcript: string;
};

export type MicrophonePayload = {
  consent: true;
  speechApiAvailable: boolean;
  perQuestion: QuestionMicData[];
};

function variance(nums: number[]): number {
  if (nums.length < 2) return 0;
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  return nums.reduce((a, b) => a + (b - mean) ** 2, 0) / nums.length;
}
void variance; // silence unused warning — kept for future stress score

export function useAudioAnalyzer(enabled: boolean) {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const speechApiAvailableRef = useRef(false);

  // Per-question accumulators
  const currentQRef = useRef(0);
  const questionStartRef = useRef(Date.now());
  const volumeSamplesRef = useRef<number[]>([]);
  const maxVolumeRef = useRef(0);
  const silenceStartRef = useRef<number | null>(null);
  const silenceCountRef = useRef(0);
  const totalSilenceMsRef = useRef(0);
  const speakingStartRef = useRef<number | null>(null);
  const speakingMsRef = useRef(0);
  const transcriptRef = useRef("");
  const wordCountRef = useRef(0);
  const fillerCountsRef = useRef<Record<string, number>>({});

  const perQuestionRef = useRef<QuestionMicData[]>([]);

  function flushQuestion() {
    const samples = volumeSamplesRef.current;
    const avgVol = samples.length > 0 ? samples.reduce((a, b) => a + b, 0) / samples.length : 0;
    const now = Date.now();
    const elapsed = now - questionStartRef.current;
    // Close any open speaking/silence periods
    if (speakingStartRef.current) {
      speakingMsRef.current += now - speakingStartRef.current;
      speakingStartRef.current = null;
    }
    if (silenceStartRef.current) {
      const silMs = now - silenceStartRef.current;
      if (silMs >= SILENCE_MIN_MS) {
        silenceCountRef.current++;
        totalSilenceMsRef.current += silMs;
      }
      silenceStartRef.current = null;
    }

    const speakingMs = speakingMsRef.current;
    const fillerTotal = Object.values(fillerCountsRef.current).reduce((a, b) => a + b, 0);
    const wpm = speakingMs > 0 ? Math.round((wordCountRef.current / speakingMs) * 60000) : 0;
    const fillerRate = elapsed > 0 ? Math.round((fillerTotal / elapsed) * 60000) : 0;

    if (elapsed > 500) {
      perQuestionRef.current.push({
        questionIndex: currentQRef.current,
        wpm,
        fillerWords: { ...fillerCountsRef.current },
        fillerWordTotal: fillerTotal,
        fillerWordRate: fillerRate,
        avgVolume: Math.round(avgVol * 1000) / 1000,
        maxVolume: Math.round(maxVolumeRef.current * 1000) / 1000,
        silencePeriods: silenceCountRef.current,
        totalSilenceMs: totalSilenceMsRef.current,
        speakingTimeMs: speakingMs,
        transcript: transcriptRef.current.trim(),
      });
    }
  }

  function resetQuestion(index: number) {
    currentQRef.current = index;
    questionStartRef.current = Date.now();
    volumeSamplesRef.current = [];
    maxVolumeRef.current = 0;
    silenceStartRef.current = null;
    silenceCountRef.current = 0;
    totalSilenceMsRef.current = 0;
    speakingStartRef.current = null;
    speakingMsRef.current = 0;
    transcriptRef.current = "";
    wordCountRef.current = 0;
    fillerCountsRef.current = {};
  }

  const onQuestionShown = useCallback((index: number) => {
    if (index > 0) flushQuestion();
    resetQuestion(index);
    // Re-start speech recognition for each question
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch { /* noop */ }
      try { recognitionRef.current.start(); } catch { /* noop */ }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onAnswerSubmitted = useCallback((_index: number) => {
    flushQuestion();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getPayload = useCallback((): MicrophonePayload | null => {
    if (!enabled) return null;
    return {
      consent: true,
      speechApiAvailable: speechApiAvailableRef.current,
      perQuestion: perQuestionRef.current,
    };
  }, [enabled]);

  const start = useCallback(async () => {
    if (!enabled) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;

      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      analyserRef.current = analyser;

      const buf = new Float32Array(analyser.fftSize);

      function tick() {
        analyser.getFloatTimeDomainData(buf);
        const rms = Math.sqrt(buf.reduce((sum, v) => sum + v * v, 0) / buf.length);
        volumeSamplesRef.current.push(rms);
        if (rms > maxVolumeRef.current) maxVolumeRef.current = rms;

        const now = Date.now();
        if (rms < SILENCE_THRESHOLD) {
          if (!silenceStartRef.current) silenceStartRef.current = now;
          if (speakingStartRef.current) {
            speakingMsRef.current += now - speakingStartRef.current;
            speakingStartRef.current = null;
          }
        } else {
          if (silenceStartRef.current) {
            const silMs = now - silenceStartRef.current;
            if (silMs >= SILENCE_MIN_MS) {
              silenceCountRef.current++;
              totalSilenceMsRef.current += silMs;
            }
            silenceStartRef.current = null;
          }
          if (!speakingStartRef.current) speakingStartRef.current = now;
        }

        rafRef.current = requestAnimationFrame(tick);
      }
      rafRef.current = requestAnimationFrame(tick);

      // Speech recognition
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const SpeechRec = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
      if (SpeechRec) {
        speechApiAvailableRef.current = true;
        const recog = new SpeechRec();
        recog.continuous = true;
        recog.interimResults = false;
        recog.lang = "en-US";
        recognitionRef.current = recog;

        recog.onresult = (event: Event & { results: SpeechRecognitionResultList; resultIndex: number }) => {
          for (let i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i].isFinal) {
              const text = event.results[i][0].transcript;
              transcriptRef.current += " " + text;
              const words = text.trim().split(/\s+/).filter(Boolean);
              wordCountRef.current += words.length;
              for (const [key, re] of FILLER_WORDS) {
                const matches = text.match(re);
                if (matches) {
                  fillerCountsRef.current[key] = (fillerCountsRef.current[key] ?? 0) + matches.length;
                }
              }
            }
          }
        };

        recog.onerror = () => {
          // Auto-restart on error
          setTimeout(() => {
            try { recognitionRef.current?.start(); } catch { /* noop */ }
          }, 300);
        };

        recog.start();
      }
    } catch (err) {
      console.warn("[audio-analyzer] failed to start:", err);
    }
  }, [enabled]);

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    try { recognitionRef.current?.abort(); } catch { /* noop */ }
    audioCtxRef.current?.close().catch(() => {});
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  return { start, stop, onQuestionShown, onAnswerSubmitted, getPayload };
}
