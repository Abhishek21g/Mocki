export function TypingIndicator() {
  return (
    <div
      className="rounded-[0_12px_12px_12px] p-5"
      style={{ background: "var(--surface2)", borderLeft: "3px solid var(--green)" }}
    >
      <div className="flex items-center gap-1.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-2 w-2 rounded-full"
            style={{
              background: "var(--green)",
              animation: `bounce-dot 1s infinite ${i * 150}ms`,
            }}
          />
        ))}
      </div>
      <div className="mono mt-2 text-xs" style={{ color: "var(--text-3)" }}>
        The panel is deciding how to continue the conversation...
      </div>
    </div>
  );
}
