import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  className?: string;
}

type CamState = "off" | "requesting" | "on" | "denied";

export function WebcamFeed({ className }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [camState, setCamState] = useState<CamState>("off");
  const [mirrored, setMirrored] = useState(true);

  async function startCamera() {
    setCamState("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCamState("on");
    } catch {
      setCamState("denied");
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCamState("off");
  }

  // Clean up on unmount
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Attach stream when video element mounts after camState turns "on"
  useEffect(() => {
    if (camState === "on" && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [camState]);

  if (camState === "off" || camState === "denied") {
    return (
      <button
        onClick={startCamera}
        className={cn(
          "flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition-colors",
          camState === "denied"
            ? "cursor-not-allowed opacity-50"
            : "hover:bg-[var(--surface2)]",
          className,
        )}
        style={{ color: "var(--text-3)", border: "1px solid var(--border)" }}
        disabled={camState === "denied"}
        title={camState === "denied" ? "Camera access denied" : "Turn on camera"}
      >
        <CamIcon />
        {camState === "denied" ? "Camera blocked" : "Camera"}
      </button>
    );
  }

  if (camState === "requesting") {
    return (
      <div
        className={cn("flex items-center gap-2 rounded-xl px-3 py-2 text-xs", className)}
        style={{ color: "var(--text-3)", border: "1px solid var(--border)" }}
      >
        <span className="gp-spinner" style={{ width: 14, height: 14 }} />
        Requesting camera…
      </div>
    );
  }

  // camState === "on"
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl shadow-lg",
        className,
      )}
      style={{ border: "1px solid var(--border)", background: "#000" }}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="block h-full w-full object-cover"
        style={{ transform: mirrored ? "scaleX(-1)" : "none" }}
      />

      {/* Controls overlay */}
      <div className="absolute bottom-2 right-2 flex gap-1">
        {/* Mirror toggle */}
        <button
          onClick={() => setMirrored((m) => !m)}
          className="rounded-lg p-1.5 text-white transition-colors hover:bg-white/20"
          title="Mirror"
          style={{ background: "rgba(0,0,0,0.5)" }}
        >
          <MirrorIcon />
        </button>
        {/* Turn off */}
        <button
          onClick={stopCamera}
          className="rounded-lg p-1.5 text-white transition-colors hover:bg-red-500/80"
          title="Turn off camera"
          style={{ background: "rgba(0,0,0,0.5)" }}
        >
          <CamOffIcon />
        </button>
      </div>

      {/* Live indicator */}
      <div
        className="absolute left-2 top-2 flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
        style={{ background: "rgba(0,0,0,0.6)", color: "#fff" }}
      >
        <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
        Live
      </div>
    </div>
  );
}

function CamIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 7l-7 5 7 5V7z" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  );
}

function CamOffIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h3a2 2 0 0 1 2 2v9.34" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8M17 22v-4" />
    </svg>
  );
}

function MirrorIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="3" x2="12" y2="21" />
      <path d="M5 7l-3 5 3 5" />
      <path d="M19 7l3 5-3 5" />
    </svg>
  );
}
