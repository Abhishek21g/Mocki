import { Outlet, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import appCss from "../styles.css?url";
import { Toaster } from "@/components/ghost/Toaster";
import { AuthBar } from "@/components/ghost/AuthBar";
import { SupabaseAuthProvider } from "@/lib/supabase-context";
import { Analytics } from "@vercel/analytics/react";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Mocki — AI Mock Interviews" },
      {
        name: "description",
        content:
          "Multi-agent AI interviews that make you genuinely better. Powered by NVIDIA Nemotron.",
      },
      { property: "og:title", content: "Mocki — AI Mock Interviews" },
      {
        property: "og:description",
        content:
          "Multi-agent AI interviews that make you genuinely better. Powered by NVIDIA Nemotron.",
      },
      { name: "twitter:title", content: "Mocki — AI Mock Interviews" },
      {
        name: "twitter:description",
        content:
          "Multi-agent AI interviews that make you genuinely better. Powered by NVIDIA Nemotron.",
      },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: () => (
    <SupabaseAuthProvider>
      <AuthBar />
      <Outlet />
      <Toaster />
    </SupabaseAuthProvider>
  ),
  notFoundComponent: () => (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-7xl font-bold" style={{ color: "var(--green)" }}>
          404
        </h1>
        <a href="/" className="mt-4 inline-block text-[color:var(--text-2)] hover:text-white">
          Back home
        </a>
      </div>
    </div>
  ),
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
        <Analytics />
      </body>
    </html>
  );
}
