import { useState } from "react";
import { Mic, Camera, MapPin, ShieldCheck } from "lucide-react";

export type ConsentChoices = {
  microphone: boolean;
  camera: boolean;
  location: boolean;
};

type Props = {
  onConfirm: (choices: ConsentChoices) => void;
};

export function ConsentModal({ onConfirm }: Props) {
  const [mic, setMic] = useState(false);
  const [cam, setCam] = useState(false);
  const [loc, setLoc] = useState(false);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(6px)" }}
    >
      <div
        className="relative mx-4 w-full max-w-md rounded-2xl p-8"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{ background: "var(--surface2)" }}
          >
            <ShieldCheck size={20} style={{ color: "var(--green)" }} />
          </div>
          <div>
            <h2 className="text-base font-semibold" style={{ color: "var(--text)" }}>
              Optional data collection
            </h2>
            <p className="text-xs" style={{ color: "var(--text-3)" }}>
              Helps improve your feedback score
            </p>
          </div>
        </div>

        {/* Options */}
        <div className="flex flex-col gap-3 mb-7">
          <ConsentRow
            icon={<Mic size={16} />}
            label="Microphone"
            description="Filler word detection, speaking pace, and silence analysis"
            checked={mic}
            onChange={setMic}
          />
          <ConsentRow
            icon={<Camera size={16} />}
            label="Camera"
            description="Face presence detection — flags looking away or multiple people in frame"
            checked={cam}
            onChange={setCam}
          />
          <ConsentRow
            icon={<MapPin size={16} />}
            label="Location"
            description="City-level only, to verify session consistency across interviews"
            checked={loc}
            onChange={setLoc}
          />
        </div>

        <p className="mb-6 text-[11px] leading-relaxed" style={{ color: "var(--text-3)" }}>
          All data is stored privately and only visible to admins. You can skip all of these — they
          are entirely optional.
        </p>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            className="flex-1 rounded-xl py-2.5 text-sm font-medium transition-opacity hover:opacity-70"
            style={{ background: "var(--surface2)", color: "var(--text-2)" }}
            onClick={() => onConfirm({ microphone: false, camera: false, location: false })}
          >
            Skip all
          </button>
          <button
            className="gp-btn flex-1"
            onClick={() => onConfirm({ microphone: mic, camera: cam, location: loc })}
          >
            Start interview →
          </button>
        </div>
      </div>
    </div>
  );
}

function ConsentRow({
  icon,
  label,
  description,
  checked,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      className="flex cursor-pointer items-start gap-3 rounded-xl p-4 transition-colors"
      style={{
        background: checked ? "color-mix(in srgb, var(--green) 10%, transparent)" : "var(--surface2)",
        border: `1px solid ${checked ? "color-mix(in srgb, var(--green) 40%, transparent)" : "var(--border)"}`,
      }}
    >
      <div className="mt-0.5 flex-shrink-0" style={{ color: checked ? "var(--green)" : "var(--text-3)" }}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium" style={{ color: "var(--text)" }}>
          {label}
        </div>
        <div className="mt-0.5 text-xs leading-relaxed" style={{ color: "var(--text-3)" }}>
          {description}
        </div>
      </div>
      <div className="mt-0.5 flex-shrink-0">
        <div
          className="h-5 w-5 rounded-md border-2 flex items-center justify-center transition-colors"
          style={{
            borderColor: checked ? "var(--green)" : "var(--border)",
            background: checked ? "var(--green)" : "transparent",
          }}
        >
          {checked && (
            <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
              <path d="M1 4L3.5 6.5L9 1" stroke="black" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>
      </div>
      <input type="checkbox" className="sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}
