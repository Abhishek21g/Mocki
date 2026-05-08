/**
 * Google Identity Services (GIS) loader.
 *
 * Used by <GoogleSignInButton> to get an ID token directly from Google
 * (popup flow) which is then exchanged for a Supabase session via
 * supabase.auth.signInWithIdToken(). This bypasses Supabase's OAuth proxy
 * entirely — no Supabase URL appears in Google Cloud Console redirect URIs.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GIS = typeof window & { google: any };

let loadPromise: Promise<void> | null = null;

export function loadGoogleIdentityServices(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if ((window as GIS).google?.accounts?.id) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(
      'script[src="https://accounts.google.com/gsi/client"]',
    );
    if (existing) {
      // Script tag already added — wait for it
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("GIS load failed")));
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loadPromise = null;
      reject(new Error("Failed to load Google Identity Services"));
    };
    document.head.appendChild(script);
  });

  return loadPromise;
}

export interface GISButtonOptions {
  /** Pixel width for the rendered Google button. Defaults to 380. */
  width?: number;
  /** Button label variant. Defaults to "continue_with". */
  text?: "signin_with" | "signup_with" | "continue_with" | "signin";
  theme?: "outline" | "filled_blue" | "filled_black";
}

/**
 * Initialize GIS and render Google's sign-in button into `container`.
 * `onCredential` is called with the raw Google ID token when the user
 * successfully picks an account.
 */
export function renderGoogleSignInButton(
  container: HTMLElement,
  clientId: string,
  onCredential: (idToken: string) => void,
  options: GISButtonOptions = {},
): void {
  const g = (window as GIS).google;
  g.accounts.id.initialize({
    client_id: clientId,
    callback: (response: { credential: string }) => {
      onCredential(response.credential);
    },
    auto_select: false,
    cancel_on_tap_outside: true,
  });
  g.accounts.id.renderButton(container, {
    theme: options.theme ?? "outline",
    size: "large",
    width: options.width ?? 380,
    text: options.text ?? "continue_with",
    logo_alignment: "left",
  });
}
