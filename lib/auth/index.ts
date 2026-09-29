import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "@/lib/db";
import { sendEmail } from "@/lib/notifications/email";

export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

export const auth = betterAuth({
  appName: "Edura",
  baseURL: process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    // Accounts are provisioned by school administrators, never self-registered.
    disableSignUp: true,
    requireEmailVerification: false,
    minPasswordLength: 8,
    sendResetPassword: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Reset your Edura password",
        text: `Hello ${user.name},\n\nUse the link below to reset your password:\n${url}\n\nIf you did not request this, you can ignore this email.`,
      });
    },
  },
  session: {
    expiresIn: SESSION_MAX_AGE_SECONDS,
    updateAge: 60 * 60 * 24,
    // No cookie cache: every request checks the Session table so revocation (password reset, deactivation) is immediate.
  },
  user: {
    additionalFields: {
      role: { type: "string", required: false, defaultValue: "TEACHER", input: false },
      schoolId: { type: "string", required: false, input: false },
      isActive: { type: "boolean", required: false, defaultValue: true, input: false },
      phone: { type: "string", required: false, input: false },
    },
  },
  plugins: [nextCookies()],
});

export type Auth = typeof auth;
