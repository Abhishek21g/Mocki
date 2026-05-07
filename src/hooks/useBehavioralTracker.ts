import { useCallback, useEffect, useRef } from "react";

// ── Types ──────────────────────────────────────────────────────────────────────

type TabEvent = { type: "blur" | "focus" | "hidden" | "visible"; ts: number; qIdx: number };
type PasteEvent = { ts: number; qIdx: number; pastedLen: number; answerLenBefore: number };
type RightClickEvent = { ts: number; qIdx: number };
type PauseEvent = { ts: number; duration: number };

type QuestionData = {
  qIdx: number;
  question: string;
  shownAt: number;
  submittedAt: number | null;
  firstKeystrokeAt: number | null;
  lastKeystrokeAt: number | null;
  keystrokes: number;
  backspaces: number;
  pasteCount: number;
  tabSwitches: number;
  pauses: PauseEvent[];
  answerLength: number;
  fillerWords: Record<string, number>;
  totalFillersCount: number;
  wordCount: number;
};

export type BehavioralPayload = {
  capturedAt: string;
  fingerprint: {
    screenWidth: number;
    screenHeight: number;
    timezone: string;
    language: string;
    userAgent: string;
    devicePixelRatio: number;
    platform: string;
    hardwareConcurrency: number;
    colorDepth: number;
    referrer: string;
  };
  tabEvents: TabEvent[];
  pasteEvents: PasteEvent[];
  rightClickEvents: RightClickEvent[];
  questions: Array<{
    qIdx: number;
    question: string;
    timeToAnswerMs: number;
    timeToFirstKeystrokeMs: number | null;
    wpm: number;
    backspaceRate: number;
    longestPauseMs: number;
    totalPauseMs: number;
    pauseCount: number;
    pasteCount: number;
    tabSwitchesWhileAnswering: number;
    answerLength: number;
    fillerWords: Record<string, number>;
    fillerRate: number;
  }>;
  summary: {
    totalTabSwitches: number;
    totalTimeHiddenMs: number;
    totalPastes: number;
    totalRightClicks: number;
    avgWpm: number;
    avgBackspaceRate: number;
    mostHesitatedQuestionIdx: number | null;
  };
};

// ── Filler word detection ──────────────────────────────────────────────────────

const FILLERS: Array<[string, RegExp]> = [
  ["um", /\bum+\b/gi],
  ["uh", /\buh+\b/gi],
  ["like", /\blike\b/gi],
  ["you_know", /\byou know\b/gi],
  ["so", /\bso\b/gi],
  ["basically", /\bbasically\b/gi],
  ["literally", /\bliterally\b/gi],
  ["actually", /\bactually\b/gi],
  ["right", /\bright[?,.]?\s/gi],
  ["i_mean", /\bi mean\b/gi],
];

function countFillers(text: string) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const counts: Record<string, number> = {};
  let total = 0;
  for (const [key, pattern] of FILLERS) {
    const n = (text.match(pattern) ?? []).length;
    counts[key] = n;
    total += n;
  }
  return { counts, total, words };
}

// ── Hook ───────────────────────────────────────────────────────────────────────

const PAUSE_MS = 3000;

export function useBehavioralTracker() {
  const tabEventsRef = useRef<TabEvent[]>([]);
  const pasteEventsRef = useRef<PasteEvent[]>([]);
  const rightClickEventsRef = useRef<RightClickEvent[]>([]);
  const currentQIdxRef = useRef(0);
  const questionsRef = useRef<Map<number, QuestionData>>(new Map());
  const currentQRef = useRef<QuestionData | null>(null);
  const lastKeystrokeRef = useRef<number | null>(null);
  const tabHiddenAtRef = useRef<number | null>(null);
  const totalHiddenMsRef = useRef(0);
  const fingerprintRef = useRef<BehavioralPayload["fingerprint"] | null>(null);

  // Collect device fingerprint once on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    fingerprintRef.current = {
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      language: navigator.language,
      userAgent: navigator.userAgent,
      devicePixelRatio: window.devicePixelRatio,
      platform: navigator.platform,
      hardwareConcurrency: navigator.hardwareConcurrency ?? 0,
      colorDepth: window.screen.colorDepth,
      referrer: document.referrer,
    };
  }, []);

  // Global listeners: tab visibility, window blur/focus, right-click
  useEffect(() => {
    function onVisibility() {
      const hidden = document.visibilityState === "hidden";
      const ts = Date.now();
      tabEventsRef.current.push({ type: hidden ? "hidden" : "visible", ts, qIdx: currentQIdxRef.current });
      if (hidden) {
        tabHiddenAtRef.current = ts;
        if (currentQRef.current) currentQRef.current.tabSwitches++;
      } else if (tabHiddenAtRef.current) {
        totalHiddenMsRef.current += ts - tabHiddenAtRef.current;
        tabHiddenAtRef.current = null;
      }
    }
    function onBlur() {
      tabEventsRef.current.push({ type: "blur", ts: Date.now(), qIdx: currentQIdxRef.current });
    }
    function onFocus() {
      tabEventsRef.current.push({ type: "focus", ts: Date.now(), qIdx: currentQIdxRef.current });
    }
    function onContextMenu() {
      rightClickEventsRef.current.push({ ts: Date.now(), qIdx: currentQIdxRef.current });
    }

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    window.addEventListener("contextmenu", onContextMenu);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("contextmenu", onContextMenu);
    };
  }, []);

  // Call when a new question is displayed
  const onQuestionShown = useCallback((qIdx: number, question: string) => {
    currentQIdxRef.current = qIdx;
    lastKeystrokeRef.current = null;
    const qData: QuestionData = {
      qIdx,
      question: question.slice(0, 300),
      shownAt: Date.now(),
      submittedAt: null,
      firstKeystrokeAt: null,
      lastKeystrokeAt: null,
      keystrokes: 0,
      backspaces: 0,
      pasteCount: 0,
      tabSwitches: 0,
      pauses: [],
      answerLength: 0,
      fillerWords: {},
      totalFillersCount: 0,
      wordCount: 0,
    };
    currentQRef.current = qData;
    questionsRef.current.set(qIdx, qData);
  }, []);

  // Call when answer is submitted — finalizes that question's data
  const onAnswerSubmitted = useCallback((qIdx: number, answerText: string) => {
    const q = questionsRef.current.get(qIdx);
    if (!q) return;
    q.submittedAt = Date.now();
    q.answerLength = answerText.length;
    const { counts, total, words } = countFillers(answerText);
    q.fillerWords = counts;
    q.totalFillersCount = total;
    q.wordCount = words;
  }, []);

  // Attach these to the answer textarea
  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const now = Date.now();
    const q = currentQRef.current;
    if (!q) return;

    q.keystrokes++;
    if (e.key === "Backspace" || e.key === "Delete") q.backspaces++;
    if (!q.firstKeystrokeAt) q.firstKeystrokeAt = now;
    q.lastKeystrokeAt = now;

    if (lastKeystrokeRef.current !== null) {
      const gap = now - lastKeystrokeRef.current;
      if (gap >= PAUSE_MS) q.pauses.push({ ts: now, duration: gap });
    }
    lastKeystrokeRef.current = now;
  }, []);

  const onPaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pastedText = e.clipboardData?.getData("text") ?? "";
    const answerLenBefore = (e.currentTarget as HTMLTextAreaElement).value.length;
    if (currentQRef.current) currentQRef.current.pasteCount++;
    pasteEventsRef.current.push({
      ts: Date.now(),
      qIdx: currentQIdxRef.current,
      pastedLen: pastedText.length,
      answerLenBefore,
    });
  }, []);

  // Call at session end to get the full payload for upload
  const getPayload = useCallback((): BehavioralPayload => {
    const questions = Array.from(questionsRef.current.values()).map((q) => {
      const now = Date.now();
      const timeToAnswerMs = q.submittedAt ? q.submittedAt - q.shownAt : now - q.shownAt;
      const timeToFirstKeystrokeMs = q.firstKeystrokeAt ? q.firstKeystrokeAt - q.shownAt : null;
      const typingDurationMs =
        q.firstKeystrokeAt && q.lastKeystrokeAt
          ? q.lastKeystrokeAt - q.firstKeystrokeAt
          : timeToAnswerMs;
      const estimatedWords = q.answerLength / 5;
      const minutes = typingDurationMs / 60000;
      const wpm = minutes > 0.01 ? Math.round(estimatedWords / minutes) : 0;
      const backspaceRate =
        q.keystrokes > 0 ? Math.round((q.backspaces / q.keystrokes) * 10000) / 100 : 0;
      const longestPauseMs = q.pauses.length ? Math.max(...q.pauses.map((p) => p.duration)) : 0;
      const totalPauseMs = q.pauses.reduce((s, p) => s + p.duration, 0);
      const fillerRate =
        q.wordCount > 0 ? Math.round((q.totalFillersCount / q.wordCount) * 10000) / 100 : 0;

      return {
        qIdx: q.qIdx,
        question: q.question,
        timeToAnswerMs,
        timeToFirstKeystrokeMs,
        wpm,
        backspaceRate,
        longestPauseMs,
        totalPauseMs,
        pauseCount: q.pauses.length,
        pasteCount: q.pasteCount,
        tabSwitchesWhileAnswering: q.tabSwitches,
        answerLength: q.answerLength,
        fillerWords: q.fillerWords,
        fillerRate,
      };
    });

    const totalTabSwitches = tabEventsRef.current.filter((e) => e.type === "hidden").length;
    const scoredQs = questions.filter((q) => q.wpm > 0);
    const avgWpm = scoredQs.length
      ? Math.round(scoredQs.reduce((s, q) => s + q.wpm, 0) / scoredQs.length)
      : 0;
    const avgBackspaceRate =
      questions.length
        ? Math.round((questions.reduce((s, q) => s + q.backspaceRate, 0) / questions.length) * 100) / 100
        : 0;
    const mostHesitatedQuestionIdx =
      questions.length
        ? questions.reduce(
            (best, q) =>
              (q.timeToFirstKeystrokeMs ?? 0) > (best.timeToFirstKeystrokeMs ?? 0) ? q : best,
            questions[0],
          ).qIdx
        : null;

    return {
      capturedAt: new Date().toISOString(),
      fingerprint: fingerprintRef.current ?? {
        screenWidth: 0, screenHeight: 0, timezone: "", language: "",
        userAgent: "", devicePixelRatio: 1, platform: "",
        hardwareConcurrency: 0, colorDepth: 0, referrer: "",
      },
      tabEvents: tabEventsRef.current,
      pasteEvents: pasteEventsRef.current,
      rightClickEvents: rightClickEventsRef.current,
      questions,
      summary: {
        totalTabSwitches,
        totalTimeHiddenMs: totalHiddenMsRef.current,
        totalPastes: pasteEventsRef.current.length,
        totalRightClicks: rightClickEventsRef.current.length,
        avgWpm,
        avgBackspaceRate,
        mostHesitatedQuestionIdx,
      },
    };
  }, []);

  return { onQuestionShown, onAnswerSubmitted, onKeyDown, onPaste, getPayload };
}
