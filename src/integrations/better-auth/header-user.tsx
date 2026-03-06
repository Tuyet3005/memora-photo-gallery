import { Link } from "@tanstack/react-router";
import { UserPlus } from "lucide-react";
import { useState } from "react";
import { GrantDelegationDialog } from "#/components/GrantDelegationDialog";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import { Button } from "#/components/ui/button";
import { authClient } from "#/lib/auth-client";

export default function BetterAuthHeader() {
  const { data: session, isPending } = authClient.useSession();
  const [delegationDialogOpen, setDelegationDialogOpen] = useState(false);

  if (isPending) {
    return <Avatar className="h-8 w-8 animate-pulse" />;
  }

  if (session?.user) {
    return (
      <div className="flex items-center gap-2">
        <Avatar className="h-8 w-8">
          <AvatarImage src={session.user.image ?? undefined} alt="" />
          <AvatarFallback className="text-xs">
            {session.user.name?.charAt(0).toUpperCase() || "U"}
          </AvatarFallback>
        </Avatar>
        <Button
          variant="ghost"
          size="icon"
          title="Grant upload access"
          onClick={() => setDelegationDialogOpen(true)}
        >
          <UserPlus className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
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
