import { useEffect, useRef } from "react";

export function useCamRecorder(stream: MediaStream | null) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeRef = useRef("video/webm");
  // Resolves after the cleanup stop's final ondataavailable fires
  const cleanupStopRef = useRef<Promise<void> | null>(null);

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
    cleanupStopRef.current = null;

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
      if (recorder.state !== "inactive") {
        // Track when the final ondataavailable fires so getBlob() can await it
        cleanupStopRef.current = new Promise<void>((resolve) => {
          recorder.addEventListener("stop", () => resolve(), { once: true });
          recorder.stop();
        });
      }
      recorderRef.current = null;
    };
  }, [stream]);

  async function getBlob(): Promise<{ blob: Blob; mimeType: string } | null> {
    const recorder = recorderRef.current;

    if (recorder && recorder.state !== "inactive") {
      // Still recording — stop it and wait for final data
      await new Promise<void>((resolve) => {
        recorder.addEventListener("stop", () => resolve(), { once: true });
        recorder.stop();
      });
    } else if (cleanupStopRef.current) {
      // Cleanup already stopped it — wait for the final ondataavailable
      await cleanupStopRef.current;
    }

    if (!chunksRef.current.length) return null;
    const mime = mimeRef.current;
    return { blob: new Blob(chunksRef.current, { type: mime }), mimeType: mime };
  }

  return { getBlob };
}
