import { PostHogErrorBoundary, PostHogProvider } from "@posthog/react";
import { TanStackDevtools } from "@tanstack/react-devtools";
import type { QueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import type { TRPCOptionsProxy } from "@trpc/tanstack-react-query";
import type { PostHogConfig } from "posthog-js";
import type { TRPCRouter } from "#/integrations/trpc/router";
import Header from "../components/Header";
import { Toaster } from "../components/ui/sonner";
import { TooltipProvider } from "../components/ui/tooltip";
import TanStackQueryDevtools from "../integrations/tanstack-query/devtools";
import TanStackQueryProvider from "../integrations/tanstack-query/root-provider";
import appCss from "../styles.css?url";

const posthogOptions: Partial<PostHogConfig> = {
  api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST as string,
  defaults: "2026-01-30",
} as const;

interface MyRouterContext {
  queryClient: QueryClient;

  trpc: TRPCOptionsProxy<TRPCRouter>;
}

function NoopBoundary({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

const THEME_INIT_SCRIPT = `(function(){try{var stored=window.localStorage.getItem('theme');var mode=(stored==='light'||stored==='dark'||stored==='auto')?stored:'auto';var prefersDark=window.matchMedia('(prefers-color-scheme: dark)').matches;var resolved=mode==='auto'?(prefersDark?'dark':'light'):mode;var root=document.documentElement;root.classList.remove('light','dark');root.classList.add(resolved);if(mode==='auto'){root.removeAttribute('data-theme')}else{root.setAttribute('data-theme',mode)}root.style.colorScheme=resolved;}catch(e){}})();`;

export const Route = createRootRouteWithContext<MyRouterContext>()({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "Memora",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  const ErrorBoundary =
    process.env.NODE_ENV === "production" ? PostHogErrorBoundary : NoopBoundary;

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/** biome-ignore lint/security/noDangerouslySetInnerHtml: Fixed content */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <meta
          name="google-site-verification"
          content="CkyqP2KN4s78WeI93iNkcwPKTDH2JWQ18zsccLznax0"
        />
        <HeadContent />
      </head>
      <body className="wrap-anywhere font-sans antialiased">
        <PostHogProvider
          apiKey={import.meta.env.VITE_PUBLIC_POSTHOG_KEY as string}
          options={posthogOptions}
        >
          <ErrorBoundary>
            <TanStackQueryProvider>
              <TooltipProvider>
                <Header />
                {children}
                <TanStackDevtools
                  config={{
                    position: "bottom-right",
                  }}
                  plugins={[
                    {
                      name: "Tanstack Router",
                      render: <TanStackRouterDevtoolsPanel />,
                    },
                    TanStackQueryDevtools,
                  ]}
                />
              </TooltipProvider>
            </TanStackQueryProvider>
          </ErrorBoundary>
        </PostHogProvider>
        <Toaster />
        <Scripts />
      </body>
    </html>
  );
}
