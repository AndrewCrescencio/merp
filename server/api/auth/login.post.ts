import { defineEventHandler, readBody } from "h3";
import { auth } from "#shared/auth";
import { checkAccountLockout, checkRateLimit, recordFailedAttempt, resetFailedAttempts, sendUnauthorizedError, sendValidationError } from "~~/server/utils/auth/helpers";

export default defineEventHandler(async (event) => {
  const body = await readBody<{ email?: string; password?: string; rememberMe?: boolean }>(event);

  if (!body?.email || !body?.password) {
    sendValidationError("Email and password are required");
  }

  checkRateLimit(event, body.email);

  checkAccountLockout(body.email);

  try {
    const { data } = await auth.api.signInEmail({
      body: {
        email: body.email,
        password: body.password,
        rememberMe: body.rememberMe === true,
      },
    });

    resetFailedAttempts(body.email);

    return {
      id: data.user.id,
      email: data.user.email,
      name: data.user.name,
    };
  } catch (error: any) {
    recordFailedAttempt(body.email);

    if (error?.status === 401) {
      sendUnauthorizedError("Invalid email or password");
    }

    throw error;
  }
});
