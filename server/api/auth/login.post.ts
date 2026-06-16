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
    const result = await auth.api.signInEmail({
      body: {
        email: body.email,
        password: body.password,
        rememberMe: body.rememberMe === true,
      },
      headers: event.headers,
    });

    resetFailedAttempts(body.email);

    return {
      id: result.user.id,
      email: result.user.email,
      name: result.user.name,
    };
  } catch (error: any) {
    recordFailedAttempt(body.email);

    if (error?.status === 401) {
      sendUnauthorizedError("Invalid email or password");
    }

    throw error;
  }
});
