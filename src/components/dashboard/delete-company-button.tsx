"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Trash2, Loader2 } from "lucide-react";

interface DeleteCompanyButtonProps {
  companyId: string;
  companyName: string;
}

export function DeleteCompanyButton({
  companyId,
  companyName,
}: DeleteCompanyButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);

    try {
      const res = await fetch(`/api/v1/companies/${companyId}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ message: "Failed to delete company" }));
        throw new Error(data.message || `HTTP ${res.status}`);
      }

      setOpen(false);
      router.push("/dashboard/companies");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setDeleting(false);
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
      >
        <Trash2 className="h-3 w-3 mr-1" />
        Remove
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Company</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove <strong>{companyName}</strong> from tracking?
              This will delete all associated signals, articles, and analysis data.
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          {error && (
            <div className="border-2 border-destructive bg-destructive/5 p-3">
              <p className="text-sm text-destructive font-body">{error}</p>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Removing...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Remove Company
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
