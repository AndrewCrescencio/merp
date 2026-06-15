import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { db } from "~~/server/utils/db";
import * as schema from "~~/server/utils/schema";
import { logger } from "./logger";

const corsOrigin = process.env.CORS_ORIGIN || "http://localhost:3000";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  emailAndPassword: {
    enabled: true,
    autoSignIn: false,
  },
  session: {
    expiresIn: 60 * 60 * 24,
    updateAge: 60 * 60 * 24,
    freshAge: 60 * 5,
  },
  advanced: {
    cookiePrefix: "merp",
    cookies: {
      session_token: {
        name: "merp-session_token",
        attributes: {
          sameSite: "lax" as const,
          secure: process.env.NODE_ENV === "production",
          httpOnly: true,
        },
      },
    },
  },
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",
  trustedOrigins: [corsOrigin],
});

logger.info("Better Auth instance initialized", {
  baseURL: process.env.BETTER_AUTH_URL,
  corsOrigin,
});
