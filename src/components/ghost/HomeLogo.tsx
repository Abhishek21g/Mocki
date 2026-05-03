import { useNavigate } from "@tanstack/react-router";
import { store } from "@/lib/ghost-store";
import { cn } from "@/lib/utils";

export function HomeLogo({
  className,
  resetOnClick = true,
}: {
  className?: string;
  resetOnClick?: boolean;
}) {
  const nav = useNavigate();

  return (
    <button
      type="button"
      onClick={() => {
        if (resetOnClick) {
          store.reset();
        }
        nav({ to: "/" });
      }}
      className={cn(
        "inline-flex cursor-pointer items-center rounded-md font-bold transition-all hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--green)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--bg)]",
        className,
      )}
      style={{ color: "var(--green)" }}
      aria-label="Go to Mocki home"
    >
      <img src="/Mocki.png" alt="Mocki" className="inline-block h-[1.4em] w-auto mr-2 align-middle" />
      Mocki
    </button>
  );
}
