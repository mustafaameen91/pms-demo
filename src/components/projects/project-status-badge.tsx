import { PROJECT_STATUSES, type ProjectStatus } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { getT } from "@/i18n/server";

export async function ProjectStatusBadge({ status, className }: { status: ProjectStatus; className?: string }) {
  const t = await getT();
  const s = PROJECT_STATUSES.find((x) => x.value === status) ?? PROJECT_STATUSES[0];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
        className,
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full" style={{ backgroundColor: s.color }} />
      {t(s.label)}
    </span>
  );
}
