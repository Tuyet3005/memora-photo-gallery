import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { GalleryPage } from "#/components/GalleryPage";
import { Button } from "#/components/ui/button";
import { authClient } from "#/lib/auth-client";

export const Route = createFileRoute("/")({
  validateSearch: z.object({
    name: z.string().optional(),
    folder: z.string().optional(),
    root: z.boolean().optional(),
  }),
  head: ({ match }) => ({
    meta: [
      {
        title: match.search.name ? `${match.search.name} | Memora` : "Memora",
      },
    ],
  }),
  component: IndexPage,
});

function IndexPage() {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) return null;
  if (session?.user) return <GalleryPage />;
  return <LandingPage />;
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="group relative flex flex-col gap-3 rounded-2xl border border-(--line) bg-(--surface) p-6 shadow-sm backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:border-(--chip-line) hover:shadow-md">
      <div className="flex size-11 items-center justify-center rounded-xl bg-(--sand) text-(--lagoon-deep)">
        {icon}
      </div>
      <h3 className="font-semibold text-(--sea-ink) text-base">{title}</h3>
      <p className="text-(--sea-ink-soft) text-sm leading-relaxed">
        {description}
      </p>
    </div>
  );
}

function LandingPage() {
  return (
    <main className="relative min-h-[calc(100vh-64px)] overflow-hidden bg-(--bg-base)">
      {/* Ambient background blobs */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="absolute -top-32 left-1/2 size-130 -translate-x-1/2 rounded-full bg-(--hero-a) blur-[96px]" />
        <div className="absolute top-60 -right-24 size-95 rounded-full bg-(--hero-b) blur-[80px]" />
        <div className="absolute bottom-0 left-0 size-80 rounded-full bg-(--hero-a) opacity-50 blur-[80px]" />
      </div>

      {/* Hero */}
      <section className="relative mx-auto flex max-w-4xl flex-col items-center px-6 pt-24 pb-24 text-center sm:pt-32">
        {/* Kicker */}
        <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-(--chip-line) bg-(--chip-bg) px-4 py-1.5 font-semibold text-(--kicker) text-xs uppercase tracking-widest shadow-sm backdrop-blur-sm">
          <span className="size-1.5 rounded-full bg-(--lagoon)" />
          Your memories, beautifully preserved
        </span>

        {/* Heading */}
        <h1
          className="mb-6 font-bold text-(--sea-ink) text-5xl leading-[1.1] tracking-tight sm:text-6xl lg:text-7xl"
          style={{ fontFamily: "'Fraunces', serif" }}
        >
          A gallery for every{" "}
          <span
            className="relative inline-block"
            style={{
              background:
                "linear-gradient(135deg, #4fb8b2 0%, #328f97 50%, #2f6a4a 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            moment
          </span>{" "}
          that matters.
        </h1>

        {/* Sub-heading */}
        <p className="mb-10 max-w-2xl text-(--sea-ink-soft) text-lg leading-relaxed sm:text-xl">
          Memora lets you organise, revisit, and share your photo memories in a
          clean, private gallery — no algorithms, no noise, just your story.
        </p>

        {/* CTA */}
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button
            size="lg"
            className="rounded-full px-8 font-semibold text-base shadow-[rgba(79,184,178,0.25)] shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-[rgba(79,184,178,0.35)] hover:shadow-xl"
            style={{
              background: "linear-gradient(135deg, #4fb8b2 0%, #328f97 100%)",
              color: "#fff",
              border: "none",
            }}
            asChild
          >
            <Link to="/signin">Get started — it's free</Link>
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="rounded-full border-(--chip-line) bg-(--chip-bg) px-8 font-semibold text-(--sea-ink) text-base backdrop-blur-sm transition-all hover:-translate-y-0.5"
            asChild
          >
            <Link to="/signin">Sign in</Link>
          </Button>
        </div>

        {/* Social proof hint */}
        <p className="mt-8 text-(--sea-ink-soft) text-sm">
          Private by default &middot; No ads &middot; Always yours
        </p>
      </section>

      {/* Feature grid */}
      <section className="relative mx-auto max-w-5xl px-6 pb-32">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <FeatureCard
            icon={
              <svg
                aria-hidden="true"
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
            }
            title="Smart Albums"
            description="Organise photos into albums automatically or by hand. Find any memory in seconds with quick search."
          />
          <FeatureCard
            icon={
              <svg
                aria-hidden="true"
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            }
            title="Private & Secure"
            description="Your photos are yours alone. No tracking, no data mining. Share only what you choose, with who you choose."
          />
          <FeatureCard
            icon={
              <svg
                aria-hidden="true"
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                <polyline points="16 6 12 2 8 6" />
                <line x1="12" y1="2" x2="12" y2="15" />
              </svg>
            }
            title="Easy Uploads"
            description="Drag, drop, and you're done. Upload from any device and your gallery updates everywhere instantly."
          />
          <FeatureCard
            icon={
              <svg
                aria-hidden="true"
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            }
            title="Shared Galleries"
            description="Invite family or friends to a shared album. Collect everyone's shots from that trip in one beautiful place."
          />
          <FeatureCard
            icon={
              <svg
                aria-hidden="true"
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            }
            title="Timeline View"
            description="Scroll through your life chronologically. Relive moments exactly as they happened, beautifully laid out."
          />
          <FeatureCard
            icon={
              <svg
                aria-hidden="true"
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            }
            title="Memories That Last"
            description="Automatically resurface photos from years past. Never let a precious moment get buried and forgotten."
          />
        </div>
      </section>

      {/* Bottom CTA banner */}
      <section className="relative mx-auto max-w-3xl px-6 pb-32">
        <div className="flex flex-col items-center gap-6 rounded-3xl border border-(--line) bg-(--surface-strong) px-8 py-14 text-center shadow-lg backdrop-blur-md">
          <h2
            className="font-bold text-(--sea-ink) text-3xl sm:text-4xl"
            style={{ fontFamily: "'Fraunces', serif" }}
          >
            Start building your gallery today.
          </h2>
          <p className="max-w-md text-(--sea-ink-soft)">
            Free to join. No credit card required. Your first memories are just
            a click away.
          </p>
          <Button
            size="lg"
            className="rounded-full px-10 font-semibold text-base shadow-[rgba(79,184,178,0.25)] shadow-lg transition-all hover:-translate-y-0.5"
            style={{
              background: "linear-gradient(135deg, #4fb8b2 0%, #328f97 100%)",
              color: "#fff",
              border: "none",
            }}
            asChild
          >
            <Link to="/signin">Get started</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
