import { Link } from "@tanstack/react-router";
import { Button } from "#/components/ui/button";
import BetterAuthHeader from "../integrations/better-auth/header-user.tsx";

export default function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--line)] bg-[var(--header-bg)] px-4 backdrop-blur-lg">
      <nav className="page-wrap flex flex-wrap items-center gap-x-3 gap-y-2 py-3 sm:py-4">
        <h2 className="m-0 flex-shrink-0 text-base font-semibold tracking-tight">
          <Button variant="outline" size="sm" className="rounded-full" asChild>
            <Link to="/">
              <span className="h-2 w-2 rounded-full bg-[linear-gradient(90deg,#56c6be,#7ed3bf)]" />
              Memora
            </Link>
          </Button>
        </h2>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <BetterAuthHeader />
        </div>

        <div className="order-3 flex w-full flex-wrap items-center gap-x-1 gap-y-1 pb-1 sm:order-2 sm:w-auto sm:flex-nowrap sm:pb-0">
          <Button variant="ghost" size="sm" asChild>
            <Link
              to="/"
              activeProps={{ className: "bg-accent text-accent-foreground" }}
            >
              Home
            </Link>
          </Button>
        </div>
      </nav>
    </header>
  );
}
