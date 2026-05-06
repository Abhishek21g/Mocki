import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session, SupabaseClient, User } from "@supabase/supabase-js";
import { getBrowserSupabase } from "./supabase-client";

type AuthStatus = "loading" | "ready" | "unconfigured";

type SupabaseAuthState = {
  status: AuthStatus;
  client: SupabaseClient | null;
  session: Session | null;
  user: User | null;
  signInWithGoogle: (redirectTo?: string) => Promise<void>;
  signInWithGitHub: (redirectTo?: string) => Promise<void>;
  signOut: () => Promise<void>;
  getAccessToken: () => string | null;
};

const SupabaseAuthContext = createContext<SupabaseAuthState | null>(null);

export function SupabaseAuthProvider({ children }: { children: ReactNode }) {
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const accessTokenRef = useRef<string | null>(null);

  useEffect(() => {
    accessTokenRef.current = session?.access_token ?? null;
  }, [session]);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    (async () => {
      const sb = await getBrowserSupabase();
      if (cancelled) return;
      if (!sb) {
        setStatus("unconfigured");
        return;
      }
      setClient(sb);
      const { data } = await sb.auth.getSession();
      if (cancelled) return;
      setSession(data.session);
      setStatus("ready");

      const { data: subscription } = sb.auth.onAuthStateChange((_event, nextSession) => {
        setSession(nextSession);
      });
      unsubscribe = () => subscription.subscription.unsubscribe();
    })();

    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const signInWithGoogle = useCallback(
    async (redirectTo?: string) => {
      if (!client) throw new Error("Supabase is not configured");
      const target =
        redirectTo ??
        (typeof window !== "undefined" ? `${window.location.origin}/auth/callback` : undefined);
      const { error } = await client.auth.signInWithOAuth({
        provider: "google",
        options: target ? { redirectTo: target } : undefined,
      });
      if (error) throw error;
    },
    [client],
  );

  const signInWithGitHub = useCallback(
    async (redirectTo?: string) => {
      if (!client) throw new Error("Supabase is not configured");
      const target =
        redirectTo ??
        (typeof window !== "undefined" ? `${window.location.origin}/auth/callback` : undefined);
      const { error } = await client.auth.signInWithOAuth({
        provider: "github",
        options: target ? { redirectTo: target } : undefined,
      });
      if (error) throw error;
    },
    [client],
  );

  const signOut = useCallback(async () => {
    if (!client) return;
    await client.auth.signOut();
    setSession(null);
  }, [client]);

  const getAccessToken = useCallback(() => accessTokenRef.current, []);

  const value = useMemo<SupabaseAuthState>(
    () => ({
      status,
      client,
      session,
      user: session?.user ?? null,
      signInWithGoogle,
      signInWithGitHub,
      signOut,
      getAccessToken,
    }),
    [status, client, session, signInWithGoogle, signInWithGitHub, signOut, getAccessToken],
  );

  return <SupabaseAuthContext.Provider value={value}>{children}</SupabaseAuthContext.Provider>;
}

export function useSupabaseAuth(): SupabaseAuthState {
  const ctx = useContext(SupabaseAuthContext);
  if (!ctx) {
    throw new Error("useSupabaseAuth must be used inside <SupabaseAuthProvider>");
  }
  return ctx;
}
