"use client";

import { useTransition } from "react";
import { Archive, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { setProjectArchived } from "@/lib/actions/projects";
import { Button } from "@/components/ui/button";

export function ArchivedBanner({ projectId, canRestore }: { projectId: string; canRestore: boolean }) {
  const [pending, startTransition] = useTransition();

  return (
    <div role="status" className="flex items-center gap-3 border-b bg-muted px-4 py-2 text-sm sm:px-6">
      <Archive className="size-4 shrink-0 text-muted-foreground" />
      <span className="flex-1">This project is archived. It&apos;s hidden from the project list.</span>
      {canRestore && (
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await setProjectArchived(projectId, false);
              if (result.ok) toast.success("Project restored");
              else toast.error(result.error);
            })
          }
        >
          {pending && <Loader2 className="size-4 animate-spin" />}
          Restore
        </Button>
      )}
    </div>
  );
}
