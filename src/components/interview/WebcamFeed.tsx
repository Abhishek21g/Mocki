import { useEffect, useRef, useState } from "react";

type CamState = "off" | "requesting" | "on" | "denied";

export function WebcamFeed({ onStream }: { onStream?: (stream: MediaStream | null) => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [camState, setCamState] = useState<CamState>("off");
  const [mirrored, setMirrored] = useState(true);
  const [small, setSmall] = useState(false);

  // Floating position — start bottom-right
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  useEffect(() => {
    setPos({ x: window.innerWidth - 200, y: window.innerHeight - 168 });
  }, []);

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

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    dragging.current = true;
    dragOffset.current = { x: e.clientX - (pos?.x ?? 0), y: e.clientY - (pos?.y ?? 0) };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging.current || !pos) return;
    const nx = Math.max(0, Math.min(window.innerWidth - (small ? 120 : 176), e.clientX - dragOffset.current.x));
    const ny = Math.max(0, Math.min(window.innerHeight - (small ? 90 : 132) - 28, e.clientY - dragOffset.current.y));
    setPos({ x: nx, y: ny });
  }

  function onPointerUp() {
    dragging.current = false;
  }

  // Floating PIP when camera is on
  if (camState === "on" && pos) {
    const w = small ? 120 : 176;
    const h = small ? 90 : 132;
    return (
      <div
        style={{
          position: "fixed",
          left: pos.x,
          top: pos.y,
          width: w,
          zIndex: 100,
          borderRadius: 14,
          overflow: "hidden",
          boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
          border: "1.5px solid rgba(118,185,0,0.35)",
          userSelect: "none",
          touchAction: "none",
        }}
      >
        {/* Drag handle bar */}
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          style={{
            height: 22,
            background: "rgba(0,0,0,0.82)",
            backdropFilter: "blur(6px)",
            cursor: "grab",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 6px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "#ef4444", animation: "bounce-dot 1s infinite" }} />
            <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.6)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Live</span>
          </div>
          {/* Drag hint dots */}
          <div style={{ display: "flex", gap: 2 }}>
            {[0,1,2].map(i => (
              <span key={i} style={{ display: "block", width: 3, height: 3, borderRadius: "50%", background: "rgba(255,255,255,0.3)" }} />
            ))}
          </div>
          {/* Controls on handle */}
          <div style={{ display: "flex", gap: 3 }}>
            <button
              onPointerDown={e => e.stopPropagation()}
              onClick={() => setMirrored(m => !m)}
              title="Flip"
              style={{ background: "none", border: "none", padding: 2, cursor: "pointer", opacity: 0.7, lineHeight: 1 }}
            >
              <FlipIcon />
            </button>
            <button
              onPointerDown={e => e.stopPropagation()}
              onClick={() => setSmall(s => !s)}
              title={small ? "Enlarge" : "Shrink"}
              style={{ background: "none", border: "none", padding: 2, cursor: "pointer", opacity: 0.7, lineHeight: 1 }}
            >
              <SizeIcon small={small} />
            </button>
            <button
              onPointerDown={e => e.stopPropagation()}
              onClick={stopCamera}
              title="Turn off camera"
              style={{ background: "none", border: "none", padding: 2, cursor: "pointer", opacity: 0.7, lineHeight: 1 }}
            >
              <CamOffIcon />
            </button>
          </div>
        </div>

        {/* Video */}
        <div style={{ width: w, height: h, background: "#000", position: "relative" }}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{
              display: "block",
              width: "100%",
              height: "100%",
              objectFit: "cover",
              transform: mirrored ? "scaleX(-1)" : "none",
            }}
          />
        </div>
      </div>
    );
  }

  // Off / requesting / denied — small inline trigger
  return (
    <button
      onClick={camState === "denied" ? undefined : startCamera}
      disabled={camState === "denied" || camState === "requesting"}
      className="flex w-full h-full min-h-[80px] flex-col items-center justify-center gap-2 rounded-xl transition-colors"
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
          <span className="gp-spinner" style={{ width: 16, height: 16 }} />
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
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 7l-7 5 7 5V7z" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  );
}

function CamOffIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h3a2 2 0 0 1 2 2v9.34" />
    </svg>
  );
}

function FlipIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="17 1 21 5 17 9" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <polyline points="7 23 3 19 7 15" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  );
}

function SizeIcon({ small }: { small: boolean }) {
  return small ? (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  ) : (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" />
      <line x1="10" y1="14" x2="21" y2="3" /><line x1="3" y1="21" x2="14" y2="10" />
    </svg>
  );
}
