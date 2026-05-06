import { useEffect, useRef, useState } from "react";

type CamState = "off" | "requesting" | "on" | "denied";

export function WebcamFeed() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [camState, setCamState] = useState<CamState>("off");
  const [mirrored, setMirrored] = useState(true);

  async function startCamera() {
    setCamState("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      streamRef.current = stream;
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

  useEffect(() => {
    return () => { streamRef.current?.getTracks().forEach((t) => t.stop()); };
  }, []);

  useEffect(() => {
    if (camState === "on" && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [camState]);

  // Active camera — PiP video card
  if (camState === "on") {
    return (
      <div
        className="relative overflow-hidden shadow-2xl"
        style={{
          width: 192,
          height: 144,
          borderRadius: 16,
          border: "1.5px solid rgba(118,185,0,0.35)",
          background: "#000",
        }}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="block h-full w-full object-cover"
          style={{ transform: mirrored ? "scaleX(-1)" : "none" }}
        />

        {/* Live dot */}
        <div
          className="absolute left-2 top-2 flex items-center gap-1 rounded-full px-1.5 py-0.5"
          style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
        >
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
          <span className="text-[9px] font-bold uppercase tracking-widest text-white">Live</span>
        </div>

        {/* Controls */}
        <div className="absolute bottom-2 right-2 flex gap-1">
          <button
            onClick={() => setMirrored((m) => !m)}
            title="Flip"
            className="rounded-lg p-1 transition-colors hover:bg-white/20"
            style={{ background: "rgba(0,0,0,0.5)" }}
          >
            <FlipIcon />
          </button>
          <button
            onClick={stopCamera}
            title="Turn off camera"
            className="rounded-lg p-1 transition-colors hover:bg-red-600/80"
            style={{ background: "rgba(0,0,0,0.5)" }}
          >
            <CamOffIcon />
          </button>
        </div>
      </div>
    );
  }

  // Idle — small icon button
  return (
    <button
      onClick={camState === "denied" ? undefined : startCamera}
      disabled={camState === "denied"}
      title={
        camState === "denied"
          ? "Camera access denied"
          : camState === "requesting"
          ? "Requesting camera…"
          : "Turn on camera"
      }
      className="flex h-10 w-10 items-center justify-center rounded-full transition-colors"
      style={{
        background: "var(--surface2)",
        border: "1.5px solid var(--border)",
        color: camState === "denied" ? "var(--text-3)" : "var(--text-2)",
        opacity: camState === "denied" ? 0.4 : 1,
        cursor: camState === "denied" ? "not-allowed" : "pointer",
      }}
    >
      {camState === "requesting" ? (
        <span className="gp-spinner" style={{ width: 14, height: 14 }} />
      ) : (
        <CamIcon />
      )}
    </button>
  );
}

function CamIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 7l-7 5 7 5V7z" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  );
}

function CamOffIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h3a2 2 0 0 1 2 2v9.34" />
    </svg>
  );
}

function FlipIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="17 1 21 5 17 9" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <polyline points="7 23 3 19 7 15" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  );
}
