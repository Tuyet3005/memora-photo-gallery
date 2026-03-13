import { Link, useNavigate } from "@tanstack/react-router";
import { Home, LogOut, UserPlus } from "lucide-react";
import { useState } from "react";
import { GrantDelegationDialog } from "#/components/GrantDelegationDialog";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import { Button } from "#/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { authClient } from "#/lib/auth-client";

export default function BetterAuthHeader() {
  const { data: session, isPending } = authClient.useSession();
  const navigate = useNavigate();
  const [delegationDialogOpen, setDelegationDialogOpen] = useState(false);

  if (isPending) {
    return <Avatar className="size-8 animate-pulse" />;
  }

  if (session?.user) {
    return (
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              aria-label="Open account menu"
            >
              <Avatar className="size-8">
                <AvatarImage src={session.user.image ?? undefined} alt="" />
                <AvatarFallback className="text-xs">
                  {session.user.name?.charAt(0).toUpperCase() || "U"}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() => {
                navigate({
                  to: "/",
                  search: { root: true },
                  replace: false,
                });
              }}
            >
              <Home className="size-4" />
              Drive root
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="ghost"
          size="icon"
          title="Grant upload access"
          onClick={() => setDelegationDialogOpen(true)}
        >
          <UserPlus className="size-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="sm:hidden"
          title="Sign out"
          aria-label="Sign out"
          onClick={() => {
            void authClient.signOut();
          }}
        >
          <LogOut className="size-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="hidden sm:inline-flex"
          onClick={() => {
            void authClient.signOut();
          }}
        >
          Sign out
        </Button>
        <GrantDelegationDialog
          open={delegationDialogOpen}
          onOpenChange={setDelegationDialogOpen}
        />
      </div>
    );
  }

  return (
    <Button variant="outline" size="sm" asChild>
      <Link to="/signin">Sign in</Link>
    </Button>
  );
}
