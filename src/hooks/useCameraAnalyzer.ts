import { useCallback, useEffect, useRef } from "react";

export type QuestionCameraData = {
  questionIndex: number;
  framesSampled: number;
  facesDetectedAvg: number;
  lookingAwayFrames: number;
  lookingAwayPct: number;
  multipleFacesFrames: number;
  multipleFacesPct: number;
};

export type CameraPayload = {
  consent: true;
  faceDetectorAvailable: boolean;
  perQuestion: QuestionCameraData[];
};

export function useCameraAnalyzer(enabled: boolean, camStream: MediaStream | null) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const detectorRef = useRef<any>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const faceDetectorAvailableRef = useRef(false);

  // Per-question accumulators
  const currentQRef = useRef(0);
  const frameCountRef = useRef(0);
  const facesDetectedSumRef = useRef(0);
  const lookingAwayFramesRef = useRef(0);
  const multipleFacesFramesRef = useRef(0);
  const perQuestionRef = useRef<QuestionCameraData[]>([]);

  // Attach camStream to hidden video element
  useEffect(() => {
    if (!enabled || !camStream) return;
    if (!videoRef.current) {
      const v = document.createElement("video");
      v.muted = true;
      v.playsInline = true;
      videoRef.current = v;
    }
    videoRef.current.srcObject = camStream;
    videoRef.current.play().catch(() => {});
  }, [enabled, camStream]);

  function flushQuestion() {
    const frames = frameCountRef.current;
    if (frames === 0) return;
    perQuestionRef.current.push({
      questionIndex: currentQRef.current,
      framesSampled: frames,
      facesDetectedAvg: Math.round((facesDetectedSumRef.current / frames) * 100) / 100,
      lookingAwayFrames: lookingAwayFramesRef.current,
      lookingAwayPct: Math.round((lookingAwayFramesRef.current / frames) * 100),
      multipleFacesFrames: multipleFacesFramesRef.current,
      multipleFacesPct: Math.round((multipleFacesFramesRef.current / frames) * 100),
    });
  }

  function resetQuestion(index: number) {
    currentQRef.current = index;
    frameCountRef.current = 0;
    facesDetectedSumRef.current = 0;
    lookingAwayFramesRef.current = 0;
    multipleFacesFramesRef.current = 0;
  }

  const onQuestionShown = useCallback((index: number) => {
    if (index > 0) flushQuestion();
    resetQuestion(index);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onAnswerSubmitted = useCallback((_index: number) => {
    flushQuestion();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getPayload = useCallback((): CameraPayload | null => {
    if (!enabled) return null;
    return {
      consent: true,
      faceDetectorAvailable: faceDetectorAvailableRef.current,
      perQuestion: perQuestionRef.current,
    };
  }, [enabled]);

  const start = useCallback(async () => {
    if (!enabled) return;

    // Try FaceDetector (Shape Detection API — Chrome 70+)
    if ("FaceDetector" in window) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        detectorRef.current = new (window as any).FaceDetector({ fastMode: true, maxDetectedFaces: 5 });
        faceDetectorAvailableRef.current = true;
      } catch {
        faceDetectorAvailableRef.current = false;
      }
    }

    if (!canvasRef.current) {
      canvasRef.current = document.createElement("canvas");
    }

    // Sample a frame every 2 seconds
    intervalRef.current = setInterval(async () => {
      const video = videoRef.current;
      if (!video || video.readyState < 2 || video.videoWidth === 0) return;

      const canvas = canvasRef.current!;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      frameCountRef.current++;

      if (detectorRef.current) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const faces: any[] = await detectorRef.current.detect(canvas);
          const count = faces.length;
          facesDetectedSumRef.current += count;
          if (count === 0) lookingAwayFramesRef.current++;
          if (count > 1) multipleFacesFramesRef.current++;
        } catch {
          // Detection failed for this frame — skip
        }
      } else {
        // No FaceDetector — assume 1 face present, still record frame count
        facesDetectedSumRef.current += 1;
      }
    }, 2000);
  }, [enabled]);

  const stop = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    videoRef.current?.pause();
  }, []);

  return { start, stop, onQuestionShown, onAnswerSubmitted, getPayload };
}
