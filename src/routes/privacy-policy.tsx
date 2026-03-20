import { createFileRoute, Link } from "@tanstack/react-router";

const LAST_UPDATED = "March 20, 2026";

export const Route = createFileRoute("/privacy-policy")({
  head: () => ({
    meta: [
      {
        title: "Privacy Policy | Memora",
      },
    ],
  }),
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <main className="relative min-h-[calc(100vh-64px)] overflow-hidden bg-(--bg-base)">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="absolute top-8 left-1/2 size-120 -translate-x-1/2 rounded-full bg-(--hero-a) blur-[96px]" />
        <div className="absolute top-64 -left-20 size-72 rounded-full bg-(--hero-b) blur-[84px]" />
        <div className="absolute right-0 bottom-0 size-96 rounded-full bg-(--hero-a) opacity-40 blur-[88px]" />
      </div>

      <section className="relative mx-auto max-w-4xl px-6 pt-18 pb-24 sm:pt-24">
        <div className="mb-8 flex flex-wrap items-center gap-3 text-sm">
          <Link
            to="/"
            className="inline-flex items-center rounded-full border border-(--chip-line) bg-(--chip-bg) px-4 py-1.5 font-semibold text-(--sea-ink) transition hover:bg-(--link-bg-hover)"
          >
            Back to Memora
          </Link>
          <span className="text-(--sea-ink-soft)">
            Last updated {LAST_UPDATED}
          </span>
        </div>

        <div className="rounded-[2rem] border border-(--line) bg-(--surface-strong) p-7 shadow-[0_24px_80px_rgba(23,58,64,0.12)] backdrop-blur-xl sm:p-10">
          <div className="max-w-3xl">
            <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-(--chip-line) bg-(--chip-bg) px-4 py-1.5 font-semibold text-(--kicker) text-xs uppercase tracking-widest">
              Privacy Policy
            </span>
            <h1
              className="font-bold text-(--sea-ink) text-4xl leading-tight tracking-tight sm:text-5xl"
              style={{ fontFamily: "'Fraunces', serif" }}
            >
              We keep Memora private by design.
            </h1>
            <p className="mt-5 max-w-2xl text-(--sea-ink-soft) text-base leading-relaxed sm:text-lg">
              This Privacy Policy explains what information Memora processes,
              why it is processed, and the choices you have when using the
              service. Memora is built to help you manage and share your own
              photos, not to profile you or sell your data.
            </p>
          </div>

          <div className="prose prose-slate mt-10 max-w-none prose-headings:font-semibold prose-a:text-(--lagoon-deep) prose-headings:text-(--sea-ink) prose-li:text-(--sea-ink-soft) prose-p:text-(--sea-ink-soft) prose-strong:text-(--sea-ink)">
            <h2>1. Information We Process</h2>
            <p>
              When you use Memora, we may process the following categories of
              information:
            </p>
            <ul>
              <li>
                Account information, such as your name, email address, and
                profile image provided by your sign-in provider.
              </li>
              <li>
                Photo and folder metadata required to organise your gallery,
                such as file names, upload structure, share links, notes, and
                folder settings.
              </li>
              <li>
                Technical information needed to operate the service, such as
                authentication state, error logs, and limited telemetry used to
                diagnose failures.
              </li>
            </ul>

            <h2>2. How We Use Information</h2>
            <p>
              We use information only to provide and improve Memora, including
              to:
            </p>
            <ul>
              <li>authenticate users and secure accounts;</li>
              <li>store, display, organise, and share photo galleries;</li>
              <li>
                support uploads, thumbnails, notes, and folder management;
              </li>
              <li>
                detect, prevent, and investigate abuse or service failures.
              </li>
            </ul>

            <h2>3. What We Do Not Do</h2>
            <ul>
              <li>We do not sell personal information.</li>
              <li>We do not use your photos for advertising.</li>
              <li>
                We do not build marketing profiles from your uploaded content.
              </li>
            </ul>

            <h2>4. Sharing</h2>
            <p>
              Your content is private unless you intentionally share it. If you
              create a share link or grant upload access, the relevant content
              or folder access is made available to the people you authorize.
            </p>

            <h2>5. Storage and Retention</h2>
            <p>
              Memora stores only the service data needed to run the app. Some
              operational records, such as temporary upload state and share
              metadata, may be retained only as long as necessary to complete
              the related task or keep the service functioning.
            </p>

            <h2>6. Security</h2>
            <p>
              We use reasonable technical measures to protect account access and
              stored application data. No system can guarantee absolute
              security, but privacy and minimal access are core design goals.
            </p>

            <h2>7. Your Choices</h2>
            <ul>
              <li>You can choose what content to upload.</li>
              <li>You can remove shared access you previously granted.</li>
              <li>You can stop using the service at any time.</li>
            </ul>

            <h2>8. Changes to This Policy</h2>
            <p>
              If this policy changes, the updated version will be posted on this
              page with a revised last-updated date.
            </p>

            <h2>9. Contact</h2>
            <p>
              If you have privacy questions about Memora, contact the service
              operator through the support or project channel associated with
              your deployment.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
