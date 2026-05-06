import { useEffect, useRef } from "react";
import { getAudioAnalyser } from "@/lib/tts";
import type { TtsStatus } from "@/lib/tts";

export function AvatarOrb({
  ttsStatus,
  size = 72,
  onClick,
}: {
  label?: string;
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
    const headR = size * 0.38;

    // Blink state
    let blinkOpenness = 1;
    let nextBlinkAt = performance.now() + 2000 + Math.random() * 2000;
    let blinkPhase: "idle" | "closing" | "opening" = "idle";
    let blinkStart = 0;

    function draw(ts: number) {
      rafRef.current = requestAnimationFrame(draw);
      ctx!.clearRect(0, 0, size, size);

      const status = statusRef.current;
      const t = ts * 0.001;

      let energy = 0;
      if (status === "playing") {
        const analyser = getAudioAnalyser();
        if (analyser) {
          if (!dataRef.current)
            dataRef.current = new Uint8Array(analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>;
          analyser.getByteFrequencyData(dataRef.current);
          let sum = 0;
          for (let i = 0; i < 32; i++) sum += dataRef.current[i];
          energy = sum / (32 * 255);
        }
      }

      const isSpeaking = status === "playing";
      const isLoading = status === "loading";
      const breath = Math.sin(t * 1.2) * 0.012;

      // Blink animation (skip while loading)
      if (!isLoading) {
        if (blinkPhase === "idle" && ts >= nextBlinkAt) {
          blinkPhase = "closing";
          blinkStart = ts;
        }
        if (blinkPhase === "closing") {
          const prog = Math.min(1, (ts - blinkStart) / 80);
          blinkOpenness = 1 - prog;
          if (prog >= 1) { blinkPhase = "opening"; blinkStart = ts; }
        }
        if (blinkPhase === "opening") {
          const prog = Math.min(1, (ts - blinkStart) / 100);
          blinkOpenness = prog;
          if (prog >= 1) {
            blinkPhase = "idle";
            nextBlinkAt = ts + 2500 + Math.random() * 3000;
            blinkOpenness = 1;
          }
        }
      }

      // ── Outer glow ────────────────────────────────────────────────────────
      const glowR = headR * (1.25 + breath + (isSpeaking ? energy * 0.12 : 0));
      const glowAlpha = isSpeaking ? 0.22 + energy * 0.45 : 0.1 + Math.sin(t * 1.5) * 0.03;
      const glowGrad = ctx!.createRadialGradient(cx, cy, headR * 0.7, cx, cy, glowR);
      glowGrad.addColorStop(0, `rgba(118,185,0,${(glowAlpha * 0.7).toFixed(3)})`);
      glowGrad.addColorStop(1, "rgba(118,185,0,0)");
      ctx!.beginPath();
      ctx!.arc(cx, cy, glowR, 0, Math.PI * 2);
      ctx!.fillStyle = glowGrad;
      ctx!.fill();

      // Speaking rings
      if (isSpeaking) {
        for (let i = 1; i <= 2; i++) {
          const rr = headR * (1.15 + i * (0.1 + energy * 0.07));
          const a = Math.max(0, (0.2 - i * 0.06) * (1 + energy * 1.8));
          ctx!.beginPath();
          ctx!.arc(cx, cy, rr, 0, Math.PI * 2);
          ctx!.strokeStyle = `rgba(118,185,0,${a.toFixed(3)})`;
          ctx!.lineWidth = 1.5;
          ctx!.stroke();
        }
      }

      // ── Head ─────────────────────────────────────────────────────────────
      const headGrad = ctx!.createRadialGradient(
        cx - headR * 0.22, cy - headR * 0.25, headR * 0.05,
        cx, cy, headR,
      );
      headGrad.addColorStop(0, "#1c2b0f");
      headGrad.addColorStop(0.55, "#0f1a08");
      headGrad.addColorStop(1, "#080d04");
      ctx!.beginPath();
      ctx!.arc(cx, cy, headR, 0, Math.PI * 2);
      ctx!.fillStyle = headGrad;
      ctx!.fill();

      // Head border
      const borderAlpha = isSpeaking ? 0.65 + energy * 0.35 : 0.38 + Math.sin(t * 1.5) * 0.06;
      ctx!.beginPath();
      ctx!.arc(cx, cy, headR, 0, Math.PI * 2);
      ctx!.strokeStyle = `rgba(118,185,0,${borderAlpha.toFixed(3)})`;
      ctx!.lineWidth = 1.8;
      ctx!.stroke();

      // ── Scan line ─────────────────────────────────────────────────────────
      ctx!.save();
      ctx!.beginPath();
      ctx!.arc(cx, cy, headR - 1, 0, Math.PI * 2);
      ctx!.clip();
      const scanY = cy - headR + ((t * 36) % (headR * 2));
      const scanGrad = ctx!.createLinearGradient(0, scanY - 6, 0, scanY + 6);
      scanGrad.addColorStop(0, "rgba(118,185,0,0)");
      scanGrad.addColorStop(0.5, "rgba(118,185,0,0.055)");
      scanGrad.addColorStop(1, "rgba(118,185,0,0)");
      ctx!.fillStyle = scanGrad;
      ctx!.fillRect(cx - headR, scanY - 6, headR * 2, 12);
      ctx!.restore();

      // ── Eyes ─────────────────────────────────────────────────────────────
      const eyeY = cy - headR * 0.16;
      const eyeX = headR * 0.3;
      const eyeRx = headR * 0.115;
      const eyeRy = Math.max(0.8, headR * 0.125 * blinkOpenness);
      const eyeBrightness = isSpeaking ? Math.min(1, 0.75 + energy * 0.35) : 0.78;

      for (const sign of [-1, 1]) {
        const ex = cx + sign * eyeX;

        // Soft outer glow halo
        const haloGrad = ctx!.createRadialGradient(ex, eyeY, 0, ex, eyeY, eyeRx * 2.8);
        haloGrad.addColorStop(0, `rgba(140,220,0,${(eyeBrightness * 0.35).toFixed(3)})`);
        haloGrad.addColorStop(1, "rgba(118,185,0,0)");
        ctx!.beginPath();
        ctx!.ellipse(ex, eyeY, eyeRx * 2.8, Math.max(0.8, eyeRy * 2.8), 0, 0, Math.PI * 2);
        ctx!.fillStyle = haloGrad;
        ctx!.fill();

        // Eye body
        const eyeGrad = ctx!.createRadialGradient(ex - eyeRx * 0.2, eyeY - eyeRy * 0.2, 0, ex, eyeY, eyeRx);
        eyeGrad.addColorStop(0, `rgba(200,255,80,${eyeBrightness.toFixed(3)})`);
        eyeGrad.addColorStop(0.6, `rgba(118,185,0,${eyeBrightness.toFixed(3)})`);
        eyeGrad.addColorStop(1, `rgba(60,100,0,${(eyeBrightness * 0.7).toFixed(3)})`);
        ctx!.beginPath();
        ctx!.ellipse(ex, eyeY, eyeRx, eyeRy, 0, 0, Math.PI * 2);
        ctx!.fillStyle = eyeGrad;
        ctx!.fill();

        // Specular highlight
        if (blinkOpenness > 0.5) {
          ctx!.beginPath();
          ctx!.ellipse(ex - eyeRx * 0.3, eyeY - eyeRy * 0.3, eyeRx * 0.28, eyeRy * 0.25, 0, 0, Math.PI * 2);
          ctx!.fillStyle = `rgba(230,255,180,${(blinkOpenness * 0.55).toFixed(3)})`;
          ctx!.fill();
        }
      }

      // ── Mouth ────────────────────────────────────────────────────────────
      const mouthY = cy + headR * 0.36;
      const mouthW = headR * 0.42;
      const mouthH = isSpeaking ? Math.max(1.5, energy * headR * 0.28) : 1.5;
      const mouthAlpha = isSpeaking ? 0.88 + energy * 0.12 : 0.45;

      if (mouthH > 4) {
        // Open mouth: filled ellipse
        const mouthFill = ctx!.createLinearGradient(cx, mouthY - mouthH, cx, mouthY + mouthH);
        mouthFill.addColorStop(0, "rgba(50,90,0,0.85)");
        mouthFill.addColorStop(1, "rgba(15,30,0,0.7)");
        ctx!.beginPath();
        ctx!.ellipse(cx, mouthY, mouthW, mouthH, 0, 0, Math.PI * 2);
        ctx!.fillStyle = mouthFill;
        ctx!.fill();
        // Inner glow line (top teeth)
        ctx!.beginPath();
        ctx!.ellipse(cx, mouthY - mouthH * 0.3, mouthW * 0.75, mouthH * 0.18, 0, Math.PI, Math.PI * 2);
        ctx!.strokeStyle = `rgba(160,240,60,${Math.min(0.45, energy * 1.2)})`;
        ctx!.lineWidth = 1;
        ctx!.stroke();
      }
      // Mouth outline / closed line
      ctx!.beginPath();
      ctx!.ellipse(cx, mouthY, mouthW, Math.max(1.5, mouthH), 0, 0, Math.PI * 2);
      ctx!.strokeStyle = `rgba(118,185,0,${mouthAlpha.toFixed(3)})`;
      ctx!.lineWidth = 1.6;
      ctx!.stroke();

      // ── Loading spinner ───────────────────────────────────────────────────
      if (isLoading) {
        const spinAngle = t * 3;
        ctx!.beginPath();
        ctx!.arc(cx, cy, headR + 6, spinAngle, spinAngle + Math.PI * 1.4);
        ctx!.strokeStyle = "rgba(118,185,0,0.9)";
        ctx!.lineWidth = 2;
        ctx!.lineCap = "round";
        ctx!.stroke();
      }
    }

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [size]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: size, height: size, display: "block", cursor: onClick ? "pointer" : "default" }}
      onClick={onClick}
      title={onClick ? "Tap to replay question" : undefined}
    />
  );
}
