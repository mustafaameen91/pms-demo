import { redirect } from "next/navigation";
import { getUserWorkspaces, requireUser } from "@/lib/auth/session";

// Entry point: send the user to their first workspace, or to onboarding.
export default async function Home() {
  const user = await requireUser();
  const [first] = await getUserWorkspaces(user.id);
  redirect(first ? `/w/${first.slug}` : "/onboarding");
}
