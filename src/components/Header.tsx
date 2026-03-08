import BetterAuthHeader from "../integrations/better-auth/header-user.tsx";

export default function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--line)] bg-[var(--header-bg)] px-4 backdrop-blur-lg">
      <nav className="page-wrap flex flex-wrap items-center gap-x-3 gap-y-2 py-3 sm:py-4">
        <div className="flex items-center gap-2">
          <img src="/favicon.ico" alt="Memora" className="h-10" />
          <div className="flex flex-col leading-none">
            <span className="text-lg font-bold tracking-tight text-(--sea-ink)">
              Memora
            </span>
            <span className="text-[10px] font-medium tracking-widest text-muted-foreground uppercase">
              Memorable photos
            </span>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <BetterAuthHeader />
        </div>
      </nav>
    </header>
  );
}
