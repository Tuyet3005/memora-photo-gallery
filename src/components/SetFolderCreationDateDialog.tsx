import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "#/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog";
import { Input } from "#/components/ui/input";
import { useTRPC } from "#/integrations/trpc/react";

interface SetFolderCreationDateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folderId: string | null;
  folderName?: string;
}

function parseCreationDateInput(input: string): Date | null {
  const value = input.trim();
  if (!value) return null;

  // Accept dd/mm/yyyy
  const fullMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  // Accept mm/yyyy and default day to 01
  const monthYearMatch = value.match(/^(\d{1,2})\/(\d{4})$/);

  let day: number;
  let month: number;
  let year: number;

  if (fullMatch) {
    day = Number(fullMatch[1]);
    month = Number(fullMatch[2]);
    year = Number(fullMatch[3]);
  } else if (monthYearMatch) {
    day = 1;
    month = Number(monthYearMatch[1]);
    year = Number(monthYearMatch[2]);
  } else {
    return null;
  }

  if (year < 1900 || year > 3000) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;

  const parsed = new Date(year, month - 1, day);
  if (Number.isNaN(parsed.getTime())) return null;

  // Reject invalid dates like 31/02/2026.
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  return parsed;
}

export function SetFolderCreationDateDialog({
  open,
  onOpenChange,
  folderId,
  folderName,
}: SetFolderCreationDateDialogProps) {
  const trpc = useTRPC();
  const [selectedDateInput, setSelectedDateInput] = useState<string>("");
  const parsedSelectedDate = useMemo(
    () => parseCreationDateInput(selectedDateInput),
    [selectedDateInput],
  );
  const updateFolderCreationTime = useMutation(
    trpc.drive.updateFolderCreationTime.mutationOptions({
      onSuccess: () => {
        toast.success(`Created date set for ${folderName || "folder"}`);
        setSelectedDateInput("");
        onOpenChange(false);
      },
      onError: () => {
        toast.error("Failed to update folder creation date");
      },
    }),
  );

  const handleConfirm = () => {
    if (!folderId || !parsedSelectedDate) {
      toast.error("Please enter a valid date in dd/mm/yyyy or mm/yyyy format");
      return;
    }

    updateFolderCreationTime.mutate({
      folderId,
      creationDate: parsedSelectedDate,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set Folder Creation Date</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label
              htmlFor="creation-date"
              className="block font-medium text-sm"
            >
              Date
            </label>
            <Input
              id="creation-date"
              type="text"
              inputMode="numeric"
              placeholder="dd/mm/yyyy or mm/yyyy"
              value={selectedDateInput}
              onChange={(e) => setSelectedDateInput(e.target.value)}
              disabled={updateFolderCreationTime.isPending}
              className="mt-1"
            />
            <p className="mt-2 text-muted-foreground text-xs">
              Time will be set to 00:01:00 Vietnam time (UTC+7). If day is
              omitted, 01 is used.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setSelectedDateInput("");
              onOpenChange(false);
            }}
            disabled={updateFolderCreationTime.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!parsedSelectedDate || updateFolderCreationTime.isPending}
          >
            {updateFolderCreationTime.isPending ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Updating...
              </>
            ) : (
              "Set Date"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
