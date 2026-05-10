import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useSupabaseAuth } from "@/lib/supabase-context";
import { showToast } from "@/components/ghost/Toaster";

const ADMIN_EMAILS = new Set(["enaguthiabhishek@gmail.com", "muralikinti@gmail.com"]);

/**
 * Floating auth chrome shown at the top-right of every screen. Hidden when
 * Supabase isn't configured so the app stays usable in unconfigured local dev.
 */
export function AuthBar() {
  const { status, user, signInWithGoogle, signOut } = useSupabaseAuth();
  const [busy, setBusy] = useState(false);
  const isAdmin = !!user?.email && ADMIN_EMAILS.has(user.email);

  if (status === "unconfigured") return null;

  async function handleSignIn() {
    if (busy) return;
    setBusy(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Sign-in failed");
      setBusy(false);
    }
  }

  async function handleSignOut() {
    if (busy) return;
    setBusy(true);
    try {
      await signOut();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Sign-out failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed right-4 top-4 z-40 flex items-center gap-2 text-xs">
      {status === "loading" && (
        <span className="rounded-md border border-white/10 bg-black/40 px-3 py-1.5 text-[color:var(--text-3)] backdrop-blur">
          Loading…
        </span>
      )}
      {status === "ready" && user && (
        <>
          <Link
            to="/history"
            className="rounded-md border border-white/10 bg-black/40 px-3 py-1.5 text-[color:var(--text-2)] backdrop-blur transition hover:text-white"
          >
            History
          </Link>
          {isAdmin && (
            <Link
              to="/admin"
              className="rounded-md border px-3 py-1.5 font-semibold backdrop-blur transition"
              style={{
                borderColor: "rgba(118,185,0,0.35)",
                background: "rgba(118,185,0,0.09)",
                color: "var(--green)",
              }}
            >
              Admin
            </Link>
          )}
          {/* Email — hidden on mobile to save space */}
          <span
            className="hidden max-w-[160px] truncate rounded-md border border-white/10 bg-black/40 px-3 py-1.5 backdrop-blur md:inline"
            style={{ color: "var(--text-2)" }}
            title={user.email ?? user.id}
          >
            {user.email ?? "Signed in"}
          </span>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={busy}
            className="rounded-md border border-white/10 bg-black/40 px-3 py-1.5 text-[color:var(--text-2)] backdrop-blur transition hover:text-white disabled:opacity-50"
          >
            <span className="hidden sm:inline">Sign out</span>
            <span className="sm:hidden">Out</span>
          </button>
        </>
      )}
      {status === "ready" && !user && (
        <button
          type="button"
          onClick={handleSignIn}
          disabled={busy}
          className="rounded-md border border-white/10 bg-black/60 px-3 py-1.5 text-white backdrop-blur transition hover:border-white/30 disabled:opacity-60"
        >
          {busy ? "Opening…" : "Login"}
        </button>
      )}
    </div>
  );
}
