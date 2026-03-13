import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import { Button } from "#/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { useTRPC } from "#/integrations/trpc/react";

type Step = "input" | "preview" | "success" | "error";

interface PreviewUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
}

interface GrantDelegationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GrantDelegationDialog({
  open,
  onOpenChange,
}: GrantDelegationDialogProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const [email, setEmail] = useState("");
  const [step, setStep] = useState<Step>("input");
  const [previewUser, setPreviewUser] = useState<PreviewUser | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const findByEmail = useMutation(trpc.user.findByEmail.mutationOptions());
  const grantDelegation = useMutation(
    trpc.user.grantDelegation.mutationOptions(),
  );

  function reset() {
    setEmail("");
    setStep("input");
    setPreviewUser(null);
    setErrorMessage(null);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  }

  async function handleLookup() {
    const result = await findByEmail.mutateAsync({ email });
    if (!result) {
      setErrorMessage("No user found with that email.");
      return;
    }
    setPreviewUser(result);
    setErrorMessage(null);
    setStep("preview");
  }

  async function handleGrant() {
    try {
      await grantDelegation.mutateAsync({ granteeEmail: email });
      await queryClient.invalidateQueries(
        trpc.user.listMyGrantors.queryOptions(),
      );
      setStep("success");
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to grant delegation.",
      );
      setStep("error");
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Grant upload access</DialogTitle>
        </DialogHeader>

        {step === "input" && (
          <div className="flex flex-col gap-4">
            <p className="text-(--sea-ink-soft) text-sm">
              Enter the email of the user you want to allow to upload to your
              Google Drive.
            </p>
            <Input
              type="email"
              placeholder="user@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setErrorMessage(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && email) void handleLookup();
              }}
            />
            {errorMessage && (
              <p className="text-red-500 text-sm">{errorMessage}</p>
            )}
            <Button
              disabled={!email || findByEmail.isPending}
              onClick={() => void handleLookup()}
            >
              {findByEmail.isPending ? "Looking up…" : "Look up"}
            </Button>
          </div>
        )}

        {step === "preview" && previewUser && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 rounded-lg border border-(--line) bg-(--surface) p-3">
              <Avatar className="h-10 w-10">
                <AvatarImage src={previewUser.image ?? undefined} alt="" />
                <AvatarFallback className="text-xs">
                  {previewUser.name.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate font-medium text-(--sea-ink) text-sm">
                  {previewUser.name}
                </p>
                <p className="truncate text-(--sea-ink-soft) text-xs">
                  {previewUser.email}
                </p>
              </div>
            </div>
            <p className="text-(--sea-ink-soft) text-sm">
              This user will be able to upload files to your Google Drive.
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setStep("input")}
              >
                Back
              </Button>
              <Button
                className="flex-1"
                disabled={grantDelegation.isPending}
                onClick={() => void handleGrant()}
              >
                {grantDelegation.isPending ? "Granting…" : "Grant access"}
              </Button>
            </div>
          </div>
        )}

        {step === "success" && previewUser && (
          <div className="flex flex-col gap-4">
            <p className="text-(--sea-ink) text-sm">
              <span className="font-medium">{previewUser.name}</span> can now
              upload files to your Google Drive.
            </p>
            <Button onClick={() => handleOpenChange(false)}>Close</Button>
          </div>
        )}

        {step === "error" && (
          <div className="flex flex-col gap-4">
            <p className="text-red-500 text-sm">
              {errorMessage ?? "Something went wrong."}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setStep("input")}
              >
                Try again
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => handleOpenChange(false)}
              >
                Close
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
