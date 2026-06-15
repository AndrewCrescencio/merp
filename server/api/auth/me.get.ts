import { defineEventHandler, createError } from "h3";

export default defineEventHandler(async (event) => {
  const user = event.context.user as {
    id: string;
    email: string;
    name: string | null;
  } | undefined;

  if (!user) {
    throw createError({
      status: 401,
      statusText: "Unauthorized",
      message: JSON.stringify({
        error: "unauthorized",
        message: "Authentication required.",
      }),
    });
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name || null,
    activeCompanyId: null,
    companies: [],
  };
});
