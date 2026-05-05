type SpeechRecognitionConstructor = new () => SpeechRecognition;
type AudioContextCtor = new () => AudioContext;

type SpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionResult = {
  isFinal: boolean;
  0: { transcript: string };
};

type SpeechRecognitionEvent = {
  resultIndex: number;
  results: SpeechRecognitionResult[];
};

type SpeechRecognitionErrorEvent = {
  error: string;
};

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  }
}

export type SpeechRecognitionStatus = "idle" | "listening" | "processing" | "error";
export type SpeechEngine = "browser" | "proxy";

type SpeechControllerOptions = {
  onStatus: (status: SpeechRecognitionStatus) => void;
  onPartial: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (message: string) => void;
  language?: string;
  proxyUrl?: string;
};

type SpeechController = {
  supported: boolean;
  engine: SpeechEngine | null;
  start: () => void;
  stop: () => void;
  destroy: () => void;
};

function getSpeechRecognitionCtor(): SpeechRecognitionConstructor | undefined {
  if (typeof window === "undefined") return undefined;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition;
}

export function isSpeechRecognitionSupported(): boolean {
  return Boolean(getSpeechRecognitionCtor());
}

export function isAudioCaptureSupported(): boolean {
  return typeof window !== "undefined" && typeof MediaRecorder !== "undefined";
}

function normalizeProxyText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const maybe = payload as Record<string, unknown>;
  const candidates = [
    maybe.text,
    maybe.transcript,
    maybe.final,
    maybe.result,
    maybe?.data && typeof maybe.data === "object" ? (maybe.data as Record<string, unknown>).text : null,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return null;
}

function mergeFloat32(chunks: Float32Array[]): Float32Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Float32Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

function resampleLinear(input: Float32Array, inputRate: number, targetRate: number): Float32Array {
  if (inputRate === targetRate) return input;
  const ratio = targetRate / inputRate;
  const outputLength = Math.max(1, Math.floor(input.length * ratio));
  const output = new Float32Array(outputLength);
  for (let i = 0; i < outputLength; i += 1) {
    const srcPos = i / ratio;
    const left = Math.floor(srcPos);
    const right = Math.min(left + 1, input.length - 1);
    const frac = srcPos - left;
    output[i] = input[left] * (1 - frac) + input[right] * frac;
  }
  return output;
}

function encodeWavPcm16Mono(samples: Float32Array, sampleRate: number): Blob {
  const bytesPerSample = 2;
  const blockAlign = bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataLength = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  const writeString = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true); // PCM fmt chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, dataLength, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

function createProxyRecorder(options: Required<Pick<SpeechControllerOptions, "onStatus" | "onFinal" | "onError">> & {
  proxyUrl: string;
}) {
  let mediaStream: MediaStream | null = null;
  let audioContext: AudioContext | null = null;
  let sourceNode: MediaStreamAudioSourceNode | null = null;
  let processorNode: ScriptProcessorNode | null = null;
  let sampleChunks: Float32Array[] = [];
  let isRecording = false;

  async function start() {
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
      if (!AudioContextClass) {
        throw new Error("AudioContext is not supported in this browser");
      }

      sampleChunks = [];
      audioContext = new AudioContextClass();
      sourceNode = audioContext.createMediaStreamSource(mediaStream);
      processorNode = audioContext.createScriptProcessor(4096, 1, 1);
      processorNode.onaudioprocess = (event) => {
        if (!isRecording) return;
        const channel = event.inputBuffer.getChannelData(0);
        sampleChunks.push(new Float32Array(channel));
      };
      sourceNode.connect(processorNode);
      processorNode.connect(audioContext.destination);

      isRecording = true;
      options.onStatus("listening");
    } catch {
      options.onStatus("error");
      options.onError("Microphone permission denied or unavailable");
    }
  }

  async function stop() {
    if (!isRecording) return;
    options.onStatus("processing");
    isRecording = false;

    processorNode?.disconnect();
    sourceNode?.disconnect();
    const capturedRate = audioContext?.sampleRate ?? 16000;
    await audioContext?.close().catch(() => undefined);
    processorNode = null;
    sourceNode = null;
    audioContext = null;

    if (!sampleChunks.length) {
      options.onStatus("idle");
      return;
    }

    const merged = mergeFloat32(sampleChunks);
    sampleChunks = [];
    const resampled = resampleLinear(merged, capturedRate, 16000);
    const blob = encodeWavPcm16Mono(resampled, 16000);
    const formData = new FormData();
    formData.append("audio", blob, "utterance.wav");

    try {
      const res = await fetch(options.proxyUrl, {
        method: "POST",
        body: formData,
      });
      const payload = (await res.json().catch(() => null)) as unknown;
      if (!res.ok) {
        const detail =
          payload && typeof payload === "object" && "detail" in payload
            ? String((payload as Record<string, unknown>).detail)
            : "Proxy request failed";
        throw new Error(detail);
      }
      const text = normalizeProxyText(payload);
      if (!text) throw new Error("empty");
      options.onFinal(text);
      options.onStatus("idle");
    } catch (error) {
      options.onStatus("error");
      const message =
        error instanceof Error && error.message ? error.message : "Check your STT proxy endpoint.";
      options.onError(`Voice transcription failed: ${message}`);
    }
  }

  function destroy() {
    isRecording = false;
    processorNode?.disconnect();
    sourceNode?.disconnect();
    if (audioContext) {
      void audioContext.close().catch(() => undefined);
      audioContext = null;
    }
    processorNode = null;
    sourceNode = null;
    if (mediaStream) {
      mediaStream.getTracks().forEach((track) => track.stop());
      mediaStream = null;
    }
    sampleChunks = [];
  }

  return { start, stop, destroy };
}

export function createSpeechRecognitionController(options: SpeechControllerOptions): SpeechController {
  const recognitionCtor = getSpeechRecognitionCtor();
  // Always use the browser's built-in Web Speech API, regardless of whether
  // VITE_STT_PROXY_URL is set. The NVIDIA Riva proxy path remains in this
  // file for reference but is intentionally never selected.
  const sttProxyUrl = options.proxyUrl?.trim();
  const canUseProxy = false;

  if (canUseProxy && sttProxyUrl) {
    const proxy = createProxyRecorder({
      proxyUrl: sttProxyUrl,
      onStatus: options.onStatus,
      onFinal: options.onFinal,
      onError: options.onError,
    });
    return {
      supported: true,
      engine: "proxy",
      start: () => {
        void proxy.start();
      },
      stop: () => {
        void proxy.stop();
      },
      destroy: proxy.destroy,
    };
  }

  if (!recognitionCtor) {
    return {
      supported: false,
      engine: null,
      start: () => undefined,
      stop: () => undefined,
      destroy: () => undefined,
    };
  }

  const recognition = new recognitionCtor();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = options.language ?? "en-US";

  recognition.onstart = () => {
    options.onStatus("listening");
  };

  recognition.onend = () => {
    options.onStatus("idle");
  };

  recognition.onresult = (event) => {
    let interim = "";
    let final = "";
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const transcript = event.results[i][0]?.transcript?.trim();
      if (!transcript) continue;
      if (event.results[i].isFinal) final += `${transcript} `;
      else interim += `${transcript} `;
    }
    options.onPartial(interim.trim());
    if (final.trim()) options.onFinal(final.trim());
  };

  recognition.onerror = (event) => {
    options.onStatus("error");
    if (event.error === "not-allowed") {
      options.onError("Microphone permission blocked. Allow mic access and retry.");
    } else {
      options.onError("Speech recognition failed. Try again.");
    }
  };

  return {
    supported: true,
    engine: "browser",
    start: () => {
      try {
        recognition.start();
      } catch {
        // Ignore double-start in noisy pointer events.
      }
    },
    stop: () => {
      recognition.stop();
    },
    destroy: () => {
      recognition.abort();
      options.onPartial("");
    },
  };
}
