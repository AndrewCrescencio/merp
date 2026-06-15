import { auth } from "#shared/auth";

const publicRoutes = ["/api/auth/register", "/api/auth/login"];

export default defineEventHandler(async (event) => {
  const path = getRequestURL(event).pathname;

  if (publicRoutes.includes(path)) {
    return;
  }

  const session = await auth.api.getSession({ headers: event.headers });

  if (!session) {
    const isExpired = event.headers.get("cookie")?.includes("merp-session_token");

    if (isExpired) {
      throw createError({
        status: 401,
        statusText: "Unauthorized",
        message: JSON.stringify({
          error: "session_expired",
          message: "Session expired. Please login again.",
        }),
      });
    }

    throw createError({
      status: 401,
      statusText: "Unauthorized",
      message: JSON.stringify({
        error: "unauthorized",
        message: "Authentication required.",
      }),
    });
  }

  event.context.user = session.user;
  event.context.session = session.session;
});
