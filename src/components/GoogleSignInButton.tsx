/**
 * <GoogleSignInButton>
 *
 * Renders Google's official sign-in button using the Google Identity Services
 * (GIS) library. On successful account selection, exchanges the Google ID token
 * for a Supabase session via signInWithIdToken — no OAuth redirect, no Supabase
 * URL in Google Cloud Console.
 */
import { useEffect, useRef, useState } from "react";
import {
  loadGoogleIdentityServices,
  renderGoogleSignInButton,
  type GISButtonOptions,
} from "@/lib/google-gis";
import { getBrowserSupabase } from "@/lib/supabase-client";
import { maybeSendWelcomeEmail } from "@/server/welcome.functions";

// Public OAuth client ID — safe to embed in client-side code.
const GOOGLE_CLIENT_ID =
  "912403877635-0jgikn771p42ok6fm90mb7qjugpr6cqh.apps.googleusercontent.com";

interface Props extends GISButtonOptions {
  onSuccess?: () => void;
  onError?: (err: Error) => void;
}

export function GoogleSignInButton({ onSuccess, onError, ...buttonOpts }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function setup() {
      try {
        const sb = await getBrowserSupabase();
        if (!sb || !containerRef.current || cancelled) return;

        await loadGoogleIdentityServices();
        if (cancelled || !containerRef.current) return;

        renderGoogleSignInButton(
          containerRef.current,
          GOOGLE_CLIENT_ID,
          async (idToken) => {
            if (cancelled) return;
            setSigningIn(true);
            try {
              const { data, error } = await sb.auth.signInWithIdToken({
                provider: "google",
                token: idToken,
              });
              if (error) throw error;

              // Fire welcome email (non-blocking; failures are swallowed)
              const accessToken = data.session?.access_token;
              if (accessToken) {
                await maybeSendWelcomeEmail({ data: { accessToken } }).catch(() => undefined);
              }

              onSuccess?.();
            } catch (err) {
              if (!cancelled) {
                setSigningIn(false);
                onError?.(err instanceof Error ? err : new Error("Sign-in failed"));
              }
            }
          },
          buttonOpts,
        );
      } catch (err) {
        if (!cancelled) {
          setLoadError("Could not load Google Sign-In");
          onError?.(err instanceof Error ? err : new Error("GIS load failed"));
        }
      }
    }

    setup();
    return () => {
      cancelled = true;
    };
    // buttonOpts are stable references so we only need to run once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (signingIn) {
    return (
      <div
        style={{
          height: 44,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        }}
      >
        <span className="gp-spinner" />
        <span className="text-sm" style={{ color: "var(--text-2)" }}>
          Signing in…
        </span>
      </div>
    );
  }

  if (loadError) {
    return (
      <p className="text-sm text-center" style={{ color: "var(--text-3)" }}>
        {loadError} — please refresh.
      </p>
    );
  }

  // GIS renders its button iframe into this div.
  // width: 100% ensures the container fills the card; GIS clips to container width.
  return <div ref={containerRef} style={{ width: "100%" }} />;
}
