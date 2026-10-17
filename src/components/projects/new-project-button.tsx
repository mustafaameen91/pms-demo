"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NewProjectDialog } from "./new-project-dialog";

export function NewProjectButton({ workspaceSlug }: { workspaceSlug: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        New project
      </Button>
      <NewProjectDialog workspaceSlug={workspaceSlug} open={open} onOpenChange={setOpen} />
    </>
  );
}
