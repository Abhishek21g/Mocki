import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase-client";
import { maybeSendWelcomeEmail } from "@/server/welcome.functions";

const ALLOWED_POST_AUTH_PATHS = new Set(["/", "/history", "/interview", "/report", "/admin"]);

function normalizeNextPath(rawNext: string | null) {
  if (!rawNext) return "/" as const;
  if (!rawNext.startsWith("/") || rawNext.startsWith("//")) return "/" as const;
  if (!ALLOWED_POST_AUTH_PATHS.has(rawNext)) return "/" as const;
  return rawNext as "/" | "/history" | "/interview" | "/report" | "/admin";
}

export const Route = createFileRoute("/auth/callback")({
  head: () => ({
    meta: [{ title: "Signing you in… · Mocki" }],
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
          if (exchangeError) {
            const { data: existingSession } = await sb.auth.getSession();
            if (!existingSession.session) throw exchangeError;
          }
        } else {
          // Implicit flow may put tokens in the URL hash; getSession() resolves it.
          await sb.auth.getSession();
        }

        if (!cancelled) {
          const { data: sessionData } = await sb.auth.getSession();
          const accessToken = sessionData.session?.access_token;

          // Await welcome email before navigating so the HTTP request
          // isn't cancelled by the browser on page unload.
          if (accessToken) {
            await maybeSendWelcomeEmail({ data: { accessToken } }).catch(() => undefined);
          }

          // Check sessionStorage first (set by admin login page), then URL param
          const storedNext = sessionStorage.getItem("auth:next");
          if (storedNext) sessionStorage.removeItem("auth:next");
          const next = normalizeNextPath(storedNext ?? url.searchParams.get("next"));
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
          <div className="mt-6 flex flex-col gap-3">
            <button
              type="button"
              className="gp-btn"
              onClick={async () => {
                const sb = await getBrowserSupabase();
                await sb?.auth.signOut().catch(() => undefined);
                sessionStorage.removeItem("auth:next");
                window.location.href = "/";
              }}
            >
              Try again
            </button>
            <a href="/" className="text-sm underline" style={{ color: "var(--text-2)" }}>
              Back to home
            </a>
          </div>
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
