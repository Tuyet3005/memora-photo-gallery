import { useNavigate } from "@tanstack/react-router";
import BetterAuthHeader from "../integrations/better-auth/header-user.tsx";

export default function Header() {
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-50 border-[var(--line)] border-b bg-[var(--header-bg)] px-4 backdrop-blur-lg">
      <nav className="page-wrap flex items-center gap-x-3 py-3 sm:py-4">
        <button
          type="button"
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          onClick={() => {
            navigate({
              to: "/",
              search: {},
              replace: false,
            });
          }}
          aria-label="Go to home folder"
        >
          <img src="/favicon.ico" alt="Memora" className="h-10" />
          <div className="flex min-w-0 flex-col items-start overflow-hidden text-left leading-none">
            <span className="block w-full truncate bg-gradient-to-r from-pink-300 via-purple-300 to-blue-300 bg-clip-text text-lg text-transparent tracking-tight drop-shadow-[0_2px_2px_rgba(244,194,231,0.3)]">
              Memora
            </span>
            <span className="block w-full truncate font-medium text-[10px] text-muted-foreground uppercase tracking-widest">
              Memorable photos
            </span>
          </div>
        </button>
        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
          <BetterAuthHeader />
        </div>
      </nav>
    </header>
  );
}
