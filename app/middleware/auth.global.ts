export default defineNuxtRouteMiddleware(async (to) => {
  const publicPaths = [
    '/auth/login',
    '/auth/register',
    '/auth/forget-password',
    '/auth/reset-password',
    '/auth/verify-email',
  ]

  if (publicPaths.some((p) => to.path.startsWith(p))) {
    return
  }

  const api = useApiFetch()

  try {
    await api('/api/v1/me')
  } catch (error: unknown) {
    const err = error as { status?: number }
    if (err.status === 401 || err.status === 403) {
      return navigateTo('/auth/login', { replace: true })
    }
    throw error
  }
})
