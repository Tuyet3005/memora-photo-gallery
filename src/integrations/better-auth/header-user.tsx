import { Link } from "@tanstack/react-router";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import { Button } from "#/components/ui/button";
import { authClient } from "#/lib/auth-client";

export default function BetterAuthHeader() {
  const { data: session, isPending } = authClient.useSession();

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
          variant="outline"
          size="sm"
          onClick={() => {
            void authClient.signOut();
          }}
        >
          Sign out
        </Button>
      </div>
    );
  }

  return (
    <Button variant="outline" size="sm" asChild>
      <Link to="/signin">Sign in</Link>
    </Button>
  );
}
