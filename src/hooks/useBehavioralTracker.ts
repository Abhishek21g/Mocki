import { useCallback, useEffect, useRef } from "react";

// ── Types ──────────────────────────────────────────────────────────────────────

type TabEvent = { type: "blur" | "focus" | "hidden" | "visible"; ts: number; qIdx: number };
type PasteEvent = { ts: number; qIdx: number; pastedLen: number; answerLenBefore: number };
type RightClickEvent = { ts: number; qIdx: number };
type PauseEvent = { ts: number; duration: number };
type MouseClick = { ts: number; x: number; y: number; target: "textarea" | "outside" };
type MouseSample = { ts: number; x: number; y: number };
type SelectionEvent = { ts: number; qIdx: number; selectedText: string };
type CopyEvent = { ts: number; qIdx: number; copiedText: string };
type ScrollEvent = { ts: number; scrollTop: number; direction: "up" | "down" };
type MouseIdlePeriod = { ts: number; duration: number; qIdx: number };

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
  interKeystrokeIntervals: number[];
  correctionBursts: number;
  consecutiveBackspaces: number;
};

export type BehavioralPayload = {
  capturedAt: string;
  consent: {
    microphone: boolean;
    camera: boolean;
    location: boolean;
  };
  location: { lat: number; lng: number; accuracy: number } | null;
  fingerprint: {
    // Basic
    screenWidth: number;
    screenHeight: number;
    timezone: string;
    language: string;
    languages: string[];
    userAgent: string;
    devicePixelRatio: number;
    platform: string;
    hardwareConcurrency: number;
    deviceMemory: number | null;
    colorDepth: number;
    referrer: string;
    // GPU / Canvas
    webgl: { vendor: string; renderer: string; version: string } | null;
    canvasFingerprint: string;
    // Fonts
    detectedFonts: string[];
    // Battery
    battery: { level: number; charging: boolean } | null;
    // Network
    connection: { type: string; effectiveType: string; downlink: number; rtt: number; saveData: boolean } | null;
    // Browser prefs
    darkMode: boolean;
    reducedMotion: boolean;
    doNotTrack: string | null;
    adBlockerDetected: boolean;
    touchPoints: number;
    pdfViewerEnabled: boolean;
    // Privacy / identity
    localIP: string | null;
    hasVisitedBefore: boolean;
    visitCount: number;
  };
  // Events
  tabEvents: TabEvent[];
  pasteEvents: PasteEvent[];
  rightClickEvents: RightClickEvent[];
  mouseClicks: MouseClick[];
  mouseSamples: MouseSample[];
  mouseIdlePeriods: MouseIdlePeriod[];
  selectionEvents: SelectionEvent[];
  copyEvents: CopyEvent[];
  scrollEvents: ScrollEvent[];
  // Per-question
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
    correctionBursts: number;
    avgInterKeystrokeMs: number;
    keystrokeRhythmVariance: number;
    interKeystrokeIntervals: number[];
  }>;
  summary: {
    totalTabSwitches: number;
    totalTimeHiddenMs: number;
    totalPastes: number;
    totalRightClicks: number;
    totalCopies: number;
    totalSelections: number;
    totalMouseIdleMs: number;
    clicksOutsideTextarea: number;
    avgWpm: number;
    avgBackspaceRate: number;
    mostHesitatedQuestionIdx: number | null;
    totalScrollEvents: number;
    adBlockerDetected: boolean;
  };
};

// ── Constants ──────────────────────────────────────────────────────────────────

const PAUSE_MS = 3000;
const MOUSE_SAMPLE_MS = 500;
const MOUSE_IDLE_MS = 5000;
const FONTS_TO_CHECK = [
  "Arial", "Helvetica", "Times New Roman", "Courier New", "Georgia",
  "Verdana", "Comic Sans MS", "Impact", "Trebuchet MS", "Palatino Linotype",
  "Century Gothic", "Franklin Gothic Medium", "Lucida Console", "Tahoma",
  "Segoe UI", "Calibri", "Cambria", "Garamond", "Gill Sans MT", "Consolas",
  "Monaco", "Menlo", "Ubuntu", "Roboto", "SF Pro Display",
];

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

// ── Fingerprint helpers ────────────────────────────────────────────────────────

function getWebGLInfo(): BehavioralPayload["fingerprint"]["webgl"] {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl") ?? canvas.getContext("experimental-webgl");
    if (!gl) return null;
    const g = gl as WebGLRenderingContext;
    const ext = g.getExtension("WEBGL_debug_renderer_info");
    return {
      vendor: ext ? String(g.getParameter(ext.UNMASKED_VENDOR_WEBGL)) : String(g.getParameter(g.VENDOR)),
      renderer: ext ? String(g.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(g.getParameter(g.RENDERER)),
      version: String(g.getParameter(g.VERSION)),
    };
  } catch {
    return null;
  }
}

function getCanvasFingerprint(): string {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 240; canvas.height = 60;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    ctx.textBaseline = "top";
    ctx.font = "14px 'Arial'";
    ctx.fillStyle = "#f60";
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = "#069";
    ctx.fillText("mocki-fp-test", 2, 15);
    ctx.fillStyle = "rgba(102,204,0,0.7)";
    ctx.fillText("mocki-fp-test", 4, 17);
    ctx.arc(50, 50, 30, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(120,60,180,0.9)";
    ctx.stroke();
    return canvas.toDataURL().slice(-80);
  } catch {
    return "";
  }
}

function detectFonts(): string[] {
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return [];
    const testStr = "mmmmmmmmmmlli";
    ctx.font = `72px monospace`;
    const baseW = ctx.measureText(testStr).width;
    return FONTS_TO_CHECK.filter((font) => {
      ctx.font = `72px '${font}', monospace`;
      return ctx.measureText(testStr).width !== baseW;
    });
  } catch {
    return [];
  }
}

async function getBatteryInfo(): Promise<BehavioralPayload["fingerprint"]["battery"]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nav = navigator as any;
    if (!nav.getBattery) return null;
    const b = await nav.getBattery();
    return { level: Math.round(b.level * 100), charging: b.charging };
  } catch {
    return null;
  }
}

function getConnectionInfo(): BehavioralPayload["fingerprint"]["connection"] {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const conn = (navigator as any).connection ?? (navigator as any).mozConnection ?? (navigator as any).webkitConnection;
    if (!conn) return null;
    return {
      type: conn.type ?? "unknown",
      effectiveType: conn.effectiveType ?? "unknown",
      downlink: conn.downlink ?? 0,
      rtt: conn.rtt ?? 0,
      saveData: !!conn.saveData,
    };
  } catch {
    return null;
  }
}

async function getLocalIP(): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const pc = new RTCPeerConnection({ iceServers: [] });
      pc.createDataChannel("");
      const ips = new Set<string>();
      pc.onicecandidate = (e) => {
        if (!e.candidate) {
          pc.close();
          resolve(ips.size > 0 ? [...ips].join(",") : null);
          return;
        }
        const match = e.candidate.candidate.match(/(\d+\.\d+\.\d+\.\d+)/);
        if (match) ips.add(match[1]);
      };
      pc.createOffer().then((o) => pc.setLocalDescription(o)).catch(() => resolve(null));
      setTimeout(() => { try { pc.close(); } catch { /* */ } resolve(ips.size > 0 ? [...ips].join(",") : null); }, 2500);
    } catch {
      resolve(null);
    }
  });
}

function detectAdBlocker(): boolean {
  try {
    const el = document.createElement("div");
    el.className = "ad adsbox doubleclick ad-placement carbon-ads";
    el.style.cssText = "height:1px;position:absolute;top:-9999px;left:-9999px;";
    document.body.appendChild(el);
    const blocked = el.offsetHeight === 0 || el.offsetParent === null;
    document.body.removeChild(el);
    return blocked;
  } catch {
    return false;
  }
}

function getVisitInfo(): { hasVisitedBefore: boolean; visitCount: number } {
  try {
    const key = "mocki_visit_count";
    const raw = localStorage.getItem(key);
    const count = raw ? parseInt(raw, 10) : 0;
    localStorage.setItem(key, String(count + 1));
    return { hasVisitedBefore: count > 0, visitCount: count };
  } catch {
    return { hasVisitedBefore: false, visitCount: 0 };
  }
}

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

function variance(arr: number[]): number {
  if (arr.length < 2) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  return Math.round(arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length);
}

// ── Hook ───────────────────────────────────────────────────────────────────────

type ConsentChoices = { microphone: boolean; camera: boolean; location: boolean };

export function useBehavioralTracker(consent: ConsentChoices = { microphone: false, camera: false, location: false }) {
  const consentRef = useRef<ConsentChoices>(consent);
  const locationRef = useRef<{ lat: number; lng: number; accuracy: number } | null>(null);

  // Keep consentRef in sync
  consentRef.current = consent;
  const tabEventsRef = useRef<TabEvent[]>([]);
  const pasteEventsRef = useRef<PasteEvent[]>([]);
  const rightClickEventsRef = useRef<RightClickEvent[]>([]);
  const mouseClicksRef = useRef<MouseClick[]>([]);
  const mouseSamplesRef = useRef<MouseSample[]>([]);
  const mouseIdleRef = useRef<MouseIdlePeriod[]>([]);
  const selectionEventsRef = useRef<SelectionEvent[]>([]);
  const copyEventsRef = useRef<CopyEvent[]>([]);
  const scrollEventsRef = useRef<ScrollEvent[]>([]);

  const currentQIdxRef = useRef(0);
  const questionsRef = useRef<Map<number, QuestionData>>(new Map());
  const currentQRef = useRef<QuestionData | null>(null);
  const lastKeystrokeRef = useRef<number | null>(null);
  const tabHiddenAtRef = useRef<number | null>(null);
  const totalHiddenMsRef = useRef(0);
  const fingerprintRef = useRef<BehavioralPayload["fingerprint"] | null>(null);

  // Mouse idle tracking
  const lastMouseMoveRef = useRef<number>(Date.now());
  const mouseIdleStartRef = useRef<number | null>(null);
  const lastScrollTopRef = useRef(0);
  const lastMouseSampleRef = useRef(0);
  const textareaElRef = useRef<HTMLTextAreaElement | null>(null);

  // Collect full fingerprint async on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    const visitInfo = getVisitInfo();

    const partial: BehavioralPayload["fingerprint"] = {
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      language: navigator.language,
      languages: [...(navigator.languages ?? [navigator.language])],
      userAgent: navigator.userAgent,
      devicePixelRatio: window.devicePixelRatio,
      platform: navigator.platform,
      hardwareConcurrency: navigator.hardwareConcurrency ?? 0,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      deviceMemory: (navigator as any).deviceMemory ?? null,
      colorDepth: window.screen.colorDepth,
      referrer: document.referrer,
      webgl: getWebGLInfo(),
      canvasFingerprint: getCanvasFingerprint(),
      detectedFonts: detectFonts(),
      battery: null,
      connection: getConnectionInfo(),
      darkMode: window.matchMedia("(prefers-color-scheme: dark)").matches,
      reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      doNotTrack: navigator.doNotTrack,
      adBlockerDetected: detectAdBlocker(),
      touchPoints: navigator.maxTouchPoints ?? 0,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pdfViewerEnabled: !!(navigator as any).pdfViewerEnabled,
      localIP: null,
      hasVisitedBefore: visitInfo.hasVisitedBefore,
      visitCount: visitInfo.visitCount,
    };
    fingerprintRef.current = partial;

    // Async enrichments
    getBatteryInfo().then((b) => { if (fingerprintRef.current) fingerprintRef.current.battery = b; });
    getLocalIP().then((ip) => { if (fingerprintRef.current) fingerprintRef.current.localIP = ip; });
  }, []);

  // Global event listeners
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
    function onBlur() { tabEventsRef.current.push({ type: "blur", ts: Date.now(), qIdx: currentQIdxRef.current }); }
    function onFocus() { tabEventsRef.current.push({ type: "focus", ts: Date.now(), qIdx: currentQIdxRef.current }); }
    function onContextMenu() { rightClickEventsRef.current.push({ ts: Date.now(), qIdx: currentQIdxRef.current }); }

    function onMouseMove(e: MouseEvent) {
      const now = Date.now();
      // Idle detection
      if (mouseIdleStartRef.current !== null && now - lastMouseMoveRef.current >= MOUSE_IDLE_MS) {
        mouseIdleRef.current.push({ ts: now, duration: now - mouseIdleStartRef.current, qIdx: currentQIdxRef.current });
      }
      mouseIdleStartRef.current = null;
      lastMouseMoveRef.current = now;
      // Sampled positions
      if (now - lastMouseSampleRef.current > MOUSE_SAMPLE_MS) {
        mouseSamplesRef.current.push({ ts: now, x: e.clientX, y: e.clientY });
        lastMouseSampleRef.current = now;
      }
    }

    function onMouseIdle() {
      const now = Date.now();
      if (now - lastMouseMoveRef.current >= MOUSE_IDLE_MS && mouseIdleStartRef.current === null) {
        mouseIdleStartRef.current = now;
      }
    }

    function onClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      const isTextarea = target.tagName === "TEXTAREA";
      mouseClicksRef.current.push({ ts: Date.now(), x: e.clientX, y: e.clientY, target: isTextarea ? "textarea" : "outside" });
    }

    function onCopy() {
      const selected = window.getSelection()?.toString() ?? "";
      copyEventsRef.current.push({ ts: Date.now(), qIdx: currentQIdxRef.current, copiedText: selected.slice(0, 100) });
    }

    function onSelectionChange() {
      const sel = window.getSelection()?.toString() ?? "";
      if (sel.length > 5) {
        selectionEventsRef.current.push({ ts: Date.now(), qIdx: currentQIdxRef.current, selectedText: sel.slice(0, 100) });
      }
    }

    function onScroll() {
      const scrollTop = window.scrollY;
      const direction = scrollTop > lastScrollTopRef.current ? "down" : "up";
      scrollEventsRef.current.push({ ts: Date.now(), scrollTop, direction });
      lastScrollTopRef.current = scrollTop;
    }

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    window.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("click", onClick);
    document.addEventListener("copy", onCopy);
    document.addEventListener("selectionchange", onSelectionChange);
    window.addEventListener("scroll", onScroll);

    // Poll for mouse idle every 2s
    const idleInterval = setInterval(onMouseIdle, 2000);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("click", onClick);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("selectionchange", onSelectionChange);
      window.removeEventListener("scroll", onScroll);
      clearInterval(idleInterval);
    };
  }, []);

  const onQuestionShown = useCallback((qIdx: number, question: string) => {
    currentQIdxRef.current = qIdx;
    lastKeystrokeRef.current = null;
    const qData: QuestionData = {
      qIdx, question: question.slice(0, 300),
      shownAt: Date.now(), submittedAt: null,
      firstKeystrokeAt: null, lastKeystrokeAt: null,
      keystrokes: 0, backspaces: 0, pasteCount: 0, tabSwitches: 0,
      pauses: [], answerLength: 0,
      fillerWords: {}, totalFillersCount: 0, wordCount: 0,
      interKeystrokeIntervals: [], correctionBursts: 0, consecutiveBackspaces: 0,
    };
    currentQRef.current = qData;
    questionsRef.current.set(qIdx, qData);
  }, []);

  const onAnswerSubmitted = useCallback((qIdx: number, answerText: string) => {
    const q = questionsRef.current.get(qIdx);
    if (!q) return;
    q.submittedAt = Date.now();
    q.answerLength = answerText.length;
    const { counts, total, words } = countFillers(answerText);
    q.fillerWords = counts; q.totalFillersCount = total; q.wordCount = words;
  }, []);

  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const now = Date.now();
    const q = currentQRef.current;
    if (!q) return;

    // Track textarea ref for click detection
    if (!textareaElRef.current) textareaElRef.current = e.currentTarget;

    q.keystrokes++;
    const isBackspace = e.key === "Backspace" || e.key === "Delete";
    if (isBackspace) {
      q.backspaces++;
      q.consecutiveBackspaces++;
      if (q.consecutiveBackspaces >= 3) q.correctionBursts++;
    } else {
      q.consecutiveBackspaces = 0;
    }

    if (!q.firstKeystrokeAt) q.firstKeystrokeAt = now;
    q.lastKeystrokeAt = now;

    if (lastKeystrokeRef.current !== null) {
      const gap = now - lastKeystrokeRef.current;
      if (gap < 60000) q.interKeystrokeIntervals.push(gap); // ignore if > 1min (tab switch)
      if (gap >= PAUSE_MS) q.pauses.push({ ts: now, duration: gap });
    }
    lastKeystrokeRef.current = now;
  }, []);

  const onPaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pastedText = e.clipboardData?.getData("text") ?? "";
    const answerLenBefore = (e.currentTarget as HTMLTextAreaElement).value.length;
    if (currentQRef.current) currentQRef.current.pasteCount++;
    pasteEventsRef.current.push({ ts: Date.now(), qIdx: currentQIdxRef.current, pastedLen: pastedText.length, answerLenBefore });
  }, []);

  const getPayload = useCallback((): BehavioralPayload => {
    const questions = Array.from(questionsRef.current.values()).map((q) => {
      const now = Date.now();
      const timeToAnswerMs = q.submittedAt ? q.submittedAt - q.shownAt : now - q.shownAt;
      const timeToFirstKeystrokeMs = q.firstKeystrokeAt ? q.firstKeystrokeAt - q.shownAt : null;
      const typingMs = q.firstKeystrokeAt && q.lastKeystrokeAt ? q.lastKeystrokeAt - q.firstKeystrokeAt : timeToAnswerMs;
      const wpm = typingMs > 5000 ? Math.round((q.answerLength / 5) / (typingMs / 60000)) : 0;
      const backspaceRate = q.keystrokes > 0 ? Math.round((q.backspaces / q.keystrokes) * 10000) / 100 : 0;
      const longestPauseMs = q.pauses.length ? Math.max(...q.pauses.map((p) => p.duration)) : 0;
      const totalPauseMs = q.pauses.reduce((s, p) => s + p.duration, 0);
      const fillerRate = q.wordCount > 0 ? Math.round((q.totalFillersCount / q.wordCount) * 10000) / 100 : 0;
      const intervals = q.interKeystrokeIntervals;
      const avgInterKeystrokeMs = intervals.length ? Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length) : 0;
      const keystrokeRhythmVariance = variance(intervals);

      return {
        qIdx: q.qIdx, question: q.question,
        timeToAnswerMs, timeToFirstKeystrokeMs, wpm,
        backspaceRate, longestPauseMs, totalPauseMs,
        pauseCount: q.pauses.length, pasteCount: q.pasteCount,
        tabSwitchesWhileAnswering: q.tabSwitches,
        answerLength: q.answerLength, fillerWords: q.fillerWords, fillerRate,
        correctionBursts: q.correctionBursts,
        avgInterKeystrokeMs, keystrokeRhythmVariance,
        interKeystrokeIntervals: intervals.slice(0, 200), // cap at 200
      };
    });

    const totalTabSwitches = tabEventsRef.current.filter((e) => e.type === "hidden").length;
    const scoredQs = questions.filter((q) => q.wpm > 0);
    const avgWpm = scoredQs.length ? Math.round(scoredQs.reduce((s, q) => s + q.wpm, 0) / scoredQs.length) : 0;
    const avgBackspaceRate = questions.length ? Math.round((questions.reduce((s, q) => s + q.backspaceRate, 0) / questions.length) * 100) / 100 : 0;
    const mostHesitatedQuestionIdx = questions.length
      ? questions.reduce((best, q) => (q.timeToFirstKeystrokeMs ?? 0) > (best.timeToFirstKeystrokeMs ?? 0) ? q : best, questions[0]).qIdx
      : null;
    const totalMouseIdleMs = mouseIdleRef.current.reduce((s, m) => s + m.duration, 0);
    const clicksOutsideTextarea = mouseClicksRef.current.filter((c) => c.target === "outside").length;

    return {
      capturedAt: new Date().toISOString(),
      consent: consentRef.current,
      location: locationRef.current,
      fingerprint: fingerprintRef.current ?? {
        screenWidth: 0, screenHeight: 0, timezone: "", language: "", languages: [],
        userAgent: "", devicePixelRatio: 1, platform: "", hardwareConcurrency: 0,
        deviceMemory: null, colorDepth: 0, referrer: "", webgl: null,
        canvasFingerprint: "", detectedFonts: [], battery: null, connection: null,
        darkMode: false, reducedMotion: false, doNotTrack: null,
        adBlockerDetected: false, touchPoints: 0, pdfViewerEnabled: false,
        localIP: null, hasVisitedBefore: false, visitCount: 0,
      },
      tabEvents: tabEventsRef.current,
      pasteEvents: pasteEventsRef.current,
      rightClickEvents: rightClickEventsRef.current,
      mouseClicks: mouseClicksRef.current,
      mouseSamples: mouseSamplesRef.current.slice(-500), // last 500 positions
      mouseIdlePeriods: mouseIdleRef.current,
      selectionEvents: selectionEventsRef.current,
      copyEvents: copyEventsRef.current,
      scrollEvents: scrollEventsRef.current.slice(-200),
      questions,
      summary: {
        totalTabSwitches,
        totalTimeHiddenMs: totalHiddenMsRef.current,
        totalPastes: pasteEventsRef.current.length,
        totalRightClicks: rightClickEventsRef.current.length,
        totalCopies: copyEventsRef.current.length,
        totalSelections: selectionEventsRef.current.length,
        totalMouseIdleMs,
        clicksOutsideTextarea,
        avgWpm,
        avgBackspaceRate,
        mostHesitatedQuestionIdx,
        totalScrollEvents: scrollEventsRef.current.length,
        adBlockerDetected: fingerprintRef.current?.adBlockerDetected ?? false,
      },
    };
  }, []);

  return { onQuestionShown, onAnswerSubmitted, onKeyDown, onPaste, getPayload, locationRef };
}
