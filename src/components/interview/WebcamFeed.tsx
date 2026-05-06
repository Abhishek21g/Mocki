import { useEffect, useRef, useState } from "react";

type CamState = "off" | "requesting" | "on" | "denied";

export function WebcamFeed({ onStream }: { onStream?: (stream: MediaStream | null) => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [camState, setCamState] = useState<CamState>("off");
  const [mirrored, setMirrored] = useState(true);

  async function startCamera() {
    setCamState("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      onStream?.(stream);
      setCamState("on");
    } catch {
      setCamState("denied");
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    onStream?.(null);
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

  // Camera on — fills the card
  if (camState === "on") {
    return (
      <div className="relative w-full h-full min-h-[120px] overflow-hidden rounded-xl" style={{ aspectRatio: "4/3", background: "#000" }}>
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
          style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
        >
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
          <span className="text-[9px] font-bold uppercase tracking-widest text-white">Live</span>
        </div>

        {/* Controls */}
        <div className="absolute bottom-2 right-2 flex gap-1">
          <button
            onClick={() => setMirrored((m) => !m)}
            title="Flip"
            className="rounded-lg p-1.5 transition-colors hover:bg-white/20"
            style={{ background: "rgba(0,0,0,0.55)" }}
          >
            <FlipIcon />
          </button>
          <button
            onClick={stopCamera}
            title="Turn off camera"
            className="rounded-lg p-1.5 transition-colors hover:bg-red-600/80"
            style={{ background: "rgba(0,0,0,0.55)" }}
          >
            <CamOffIcon />
          </button>
        </div>
      </div>
    );
  }

  // Off / requesting / denied — centered placeholder
  return (
    <button
      onClick={camState === "denied" ? undefined : startCamera}
      disabled={camState === "denied" || camState === "requesting"}
      className="flex w-full h-full min-h-[120px] flex-col items-center justify-center gap-2 rounded-xl transition-colors"
      style={{
        background: "var(--surface3)",
        border: "1.5px dashed var(--border)",
        color: camState === "denied" ? "var(--text-3)" : "var(--text-2)",
        cursor: camState === "denied" ? "not-allowed" : camState === "requesting" ? "wait" : "pointer",
        opacity: camState === "denied" ? 0.5 : 1,
      }}
    >
      {camState === "requesting" ? (
        <>
          <span className="gp-spinner" style={{ width: 18, height: 18 }} />
          <span className="text-xs" style={{ color: "var(--text-3)" }}>Requesting…</span>
        </>
      ) : camState === "denied" ? (
        <>
          <CamIcon />
          <span className="text-xs">Camera blocked</span>
        </>
      ) : (
        <>
          <CamIcon />
          <span className="text-xs font-medium">Turn on camera</span>
        </>
      )}
    </button>
  );
}

function CamIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 7l-7 5 7 5V7z" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  );
}

function CamOffIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h3a2 2 0 0 1 2 2v9.34" />
    </svg>
  );
}

function FlipIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="17 1 21 5 17 9" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <polyline points="7 23 3 19 7 15" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  );
}
