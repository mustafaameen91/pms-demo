import "server-only";
import nodemailer from "nodemailer";

/**
 * Email delivery.
 *
 * Until SMTP is configured (SMTP_HOST etc. in .env), emails are NOT sent: they are
 * printed to the server terminal instead, so invites and resets can still be tested.
 * To send real email, set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, EMAIL_FROM.
 */
export const emailDeliveryEnabled = Boolean(process.env.SMTP_HOST);

type Email = { to: string; subject: string; text: string; html?: string };

const transport = emailDeliveryEnabled
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
    })
  : null;

export async function sendEmail(email: Email) {
  if (!transport) {
    const line = "─".repeat(72);
    console.log(
      `\n${line}\n📧 EMAIL NOT SENT — SMTP is not configured, printing instead\n` +
        `To:      ${email.to}\nSubject: ${email.subject}\n\n${email.text}\n${line}\n`,
    );
    return { delivered: false as const };
  }
  try {
    await transport.sendMail({
      from: process.env.EMAIL_FROM ?? process.env.SMTP_USER,
      to: email.to,
      subject: email.subject,
      text: email.text,
      html: email.html,
    });
    return { delivered: true as const };
  } catch (error) {
    // Never let a mail problem break the action that triggered it.
    console.error("[email] failed to send", { to: email.to, subject: email.subject, error });
    return { delivered: false as const };
  }
}

export const appUrl = (path: string) =>
  new URL(path, process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001").toString();
