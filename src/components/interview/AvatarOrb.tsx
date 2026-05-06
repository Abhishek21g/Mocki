import { useEffect, useRef } from "react";
import { getAudioAnalyser } from "@/lib/tts";
import type { TtsStatus } from "@/lib/tts";

export function AvatarOrb({
  label,
  ttsStatus,
  size = 72,
  onClick,
}: {
  label: string;
  ttsStatus: TtsStatus;
  size?: number;
  onClick?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const statusRef = useRef(ttsStatus);
  const dataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  useEffect(() => {
    statusRef.current = ttsStatus;
  }, [ttsStatus]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - 6;

    function draw(ts: number) {
      rafRef.current = requestAnimationFrame(draw);
      ctx!.clearRect(0, 0, size, size);

      const status = statusRef.current;
      const t = ts * 0.001;

      let energy = 0;
      if (status === "playing") {
        const analyser = getAudioAnalyser();
        if (analyser) {
          if (!dataRef.current) dataRef.current = new Uint8Array(analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>;
          analyser.getByteFrequencyData(dataRef.current);
          let sum = 0;
          for (let i = 0; i < 24; i++) sum += dataRef.current[i];
          energy = sum / (24 * 255);
        }
      }

      const isSpeaking = status === "playing";
      const isLoading = status === "loading";
      const breath = Math.sin(t * 1.5) * 0.04;
      const pulse = 1 + breath + (isSpeaking ? energy * 0.28 : 0);

      // Glow rings
      const ringCount = isSpeaking ? 3 : 1;
      for (let i = 0; i < ringCount; i++) {
        const rScale = pulse + i * (0.13 + energy * 0.12);
        const alpha = Math.max(0, (0.18 - i * 0.05) * (isSpeaking ? 1 + energy * 2 : 0.55));
        ctx!.beginPath();
        ctx!.arc(cx, cy, r * rScale, 0, Math.PI * 2);
        ctx!.strokeStyle = `rgba(118,185,0,${alpha.toFixed(3)})`;
        ctx!.lineWidth = 2.5;
        ctx!.stroke();
      }

      // Main circle
      const grad = ctx!.createRadialGradient(cx - r * 0.25, cy - r * 0.3, 0, cx, cy, r * pulse);
      grad.addColorStop(0, "#b8e040");
      grad.addColorStop(0.5, "#76b900");
      grad.addColorStop(1, "#2d4800");
      ctx!.beginPath();
      ctx!.arc(cx, cy, r * pulse, 0, Math.PI * 2);
      ctx!.fillStyle = grad;
      ctx!.fill();

      // Loading spinner arc
      if (isLoading) {
        const spinAngle = t * 3;
        ctx!.beginPath();
        ctx!.arc(cx, cy, r + 6, spinAngle, spinAngle + Math.PI * 1.3);
        ctx!.strokeStyle = "rgba(118,185,0,0.85)";
        ctx!.lineWidth = 2;
        ctx!.lineCap = "round";
        ctx!.stroke();
      }

      // Initials label
      ctx!.fillStyle = "#000";
      ctx!.font = `700 ${Math.floor(size * 0.27)}px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif`;
      ctx!.textAlign = "center";
      ctx!.textBaseline = "middle";
      ctx!.fillText(label, cx, cy);
    }

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [size, label]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: size, height: size, display: "block", cursor: onClick ? "pointer" : "default" }}
      onClick={onClick}
      title={onClick ? "Tap to replay question" : undefined}
    />
  );
}
