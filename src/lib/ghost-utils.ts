export function getHireColor(decision: string) {
  const map: Record<string, string> = {
    "strong yes": "#22c55e",
    yes: "#4ade80",
    "lean yes": "#86efac",
    maybe: "#eab308",
    "lean no": "#f97316",
    no: "#ef4444",
    "strong no": "#dc2626",
  };
  return map[decision] ?? "#888";
}
export function getHireBg(decision: string) {
  const map: Record<string, string> = {
    "strong yes": "#14532d",
    yes: "#166534",
    "lean yes": "#15803d",
    maybe: "#713f12",
    "lean no": "#7c2d12",
    no: "#7f1d1d",
    "strong no": "#450a0a",
  };
  return map[decision] ?? "#1a1a1a";
}
export function scoreToColor(score: number) {
  if (score >= 8) return "#76b900";
  if (score >= 6) return "#eab308";
  if (score >= 4) return "#f97316";
  return "#ef4444";
}
export function difficultyColor(d: string) {
  return (
    ({ easy: "#22c55e", medium: "#eab308", hard: "#ef4444" } as Record<string, string>)[d] ?? "#888"
  );
}
export function capitalize(str: string) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : "";
}
export function humanizeLabel(value: string) {
  return value
    .split("_")
    .map((part) => capitalize(part))
    .join(" ");
}
export function initials(name: string) {
  return name
    .split(" ")
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
