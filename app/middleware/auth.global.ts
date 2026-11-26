import { authenticateNavigation } from '~~/shared/auth-navigation'

export default defineNuxtRouteMiddleware((to) => {
  const auth = useAuthFetch()
  return authenticateNavigation(
    to.path,
    () => auth.me(),
    () => navigateTo('/auth/login', { replace: true }),
  )
})
