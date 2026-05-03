import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase-client";

export const Route = createFileRoute("/auth/callback")({
  head: () => ({
    meta: [{ title: "Signing you in… · Mockpilot" }],
  }),
  component: AuthCallback,
});

function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sb = await getBrowserSupabase();
        if (!sb) {
          throw new Error("Supabase is not configured.");
        }

        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");
        const errorDescription =
          url.searchParams.get("error_description") ?? url.searchParams.get("error");

        if (errorDescription) {
          throw new Error(errorDescription);
        }

        if (code) {
          const { error: exchangeError } = await sb.auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;
        } else {
          // Implicit flow may put tokens in the URL hash; getSession() resolves it.
          await sb.auth.getSession();
        }

        if (!cancelled) {
          const next = url.searchParams.get("next") ?? "/";
          navigate({ to: next });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Sign-in failed");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="grid-bg flex min-h-screen items-center justify-center px-6 text-center">
      {error ? (
        <div className="gp-card max-w-md p-8">
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-1)" }}>
            Sign-in failed
          </h1>
          <p className="mt-3 text-sm" style={{ color: "var(--text-2)" }}>
            {error}
          </p>
          <a href="/" className="mt-6 inline-block underline" style={{ color: "var(--text-1)" }}>
            Back to home
          </a>
        </div>
      ) : (
        <div className="flex items-center gap-3" style={{ color: "var(--text-2)" }}>
          <span className="gp-spinner" />
          Signing you in…
        </div>
      )}
    </div>
  );
}
