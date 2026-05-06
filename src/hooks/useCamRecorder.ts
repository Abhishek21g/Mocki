import { useEffect, useRef } from "react";

export function useCamRecorder(stream: MediaStream | null) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeRef = useRef("video/webm");

  useEffect(() => {
    if (!stream || typeof MediaRecorder === "undefined") return;

    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
      ? "video/webm;codecs=vp8,opus"
      : MediaRecorder.isTypeSupported("video/webm;codecs=vp8")
        ? "video/webm;codecs=vp8"
        : MediaRecorder.isTypeSupported("video/webm")
          ? "video/webm"
          : "";

    mimeRef.current = mimeType || "video/webm";
    chunksRef.current = [];

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: 250_000,
      });
    } catch {
      return;
    }

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.start(5_000);
    recorderRef.current = recorder;

    return () => {
      if (recorder.state !== "inactive") recorder.stop();
      recorderRef.current = null;
    };
  }, [stream]);

  async function getBlob(): Promise<{ blob: Blob; mimeType: string } | null> {
    const recorder = recorderRef.current;

    if (recorder && recorder.state !== "inactive") {
      await new Promise<void>((resolve) => {
        recorder.addEventListener("stop", () => resolve(), { once: true });
        recorder.stop();
      });
    }

    if (!chunksRef.current.length) return null;
    const mime = mimeRef.current;
    return { blob: new Blob(chunksRef.current, { type: mime }), mimeType: mime };
  }

  return { getBlob };
}
