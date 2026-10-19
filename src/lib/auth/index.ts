import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { organization } from "better-auth/plugins";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { appUrl, sendEmail } from "@/lib/email";
import { eq } from "drizzle-orm";
import { getT, tFor } from "@/i18n/server";

/** Language of the account with this email, or null when there is none. */
async function localeOfEmail(email: string) {
  const [row] = await db.select({ locale: schema.user.locale }).from(schema.user).where(eq(schema.user.email, email.toLowerCase())).limit(1);
  return row?.locale ?? null;
}

/** The requester's language (cookie / browser); English outside a request. */
async function requestT() {
  try {
    return await getT();
  } catch {
    return tFor("en");
  }
}

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    resetPasswordTokenExpiresIn: 60 * 60,
    sendResetPassword: async ({ user, url }) => {
      // In the account's own language.
      const t = tFor(await localeOfEmail(user.email));
      await sendEmail({
        to: user.email,
        subject: t("Reset your PMS password"),
        text: t(
          "Hi {name},\n\nSomeone asked to reset the password for your PMS account.\nOpen this link to choose a new password (valid for 1 hour):\n\n{url}\n\nIf this wasn't you, you can ignore this email.",
          { name: user.name, url },
        ),
      });
    },
  },
  plugins: [
    // Workspaces = Better Auth organizations (members, roles, invitations).
    organization({
      allowUserToCreateOrganization: true,
      creatorRole: "owner",
      invitationExpiresIn: 7 * 24 * 60 * 60,
      sendInvitationEmail: async ({ id, email, role, organization, inviter }) => {
        // The invitee's language if they already have an account, else the inviter's.
        const locale = await localeOfEmail(email);
        const t = locale ? tFor(locale) : await requestT();
        const vars = { inviter: inviter.user.name, workspace: organization.name, role: t(role), email, link: appUrl(`/invite/${id}`) };
        await sendEmail({
          to: email,
          subject: t("{inviter} invited you to {workspace} on PMS", vars),
          text: t(
            "{inviter} invited you to join \"{workspace}\" as {role}.\n\nAccept the invitation (valid for 7 days):\n{link}\n\nSign up or log in with {email} to accept.",
            vars,
          ),
        });
      },
    }),
    nextCookies(), // must stay last
  ],
});

export type Session = typeof auth.$Infer.Session;
