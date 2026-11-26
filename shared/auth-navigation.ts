const PUBLIC_PATHS = [
  '/auth/login',
  '/auth/register',
  '/auth/forget-password',
  '/auth/reset-password',
  '/auth/verify-email',
]

export async function authenticateNavigation<RedirectResult>(
  path: string,
  fetchCurrentUser: () => Promise<unknown>,
  redirectToLogin: () => RedirectResult,
): Promise<Awaited<RedirectResult> | undefined> {
  if (PUBLIC_PATHS.some((publicPath) => path.startsWith(publicPath))) return

  try {
    await fetchCurrentUser()
  } catch (error: unknown) {
    const status = (error as { status?: number }).status
    if (status === 401 || status === 403) return await redirectToLogin()
    throw error
  }
}
