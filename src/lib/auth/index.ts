import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { organization } from "better-auth/plugins";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { appUrl, sendEmail } from "@/lib/email";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    resetPasswordTokenExpiresIn: 60 * 60,
    sendResetPassword: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Reset your PMS password",
        text: `Hi ${user.name},\n\nSomeone asked to reset the password for your PMS account.\nOpen this link to choose a new password (valid for 1 hour):\n\n${url}\n\nIf this wasn't you, you can ignore this email.`,
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
        await sendEmail({
          to: email,
          subject: `${inviter.user.name} invited you to ${organization.name} on PMS`,
          text: `${inviter.user.name} invited you to join "${organization.name}" as ${role}.\n\nAccept the invitation (valid for 7 days):\n${appUrl(`/invite/${id}`)}\n\nSign up or log in with ${email} to accept.`,
        });
      },
    }),
    nextCookies(), // must stay last
  ],
});

export type Session = typeof auth.$Infer.Session;
