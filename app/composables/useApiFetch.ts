import type { AcquisitionChannel } from '~~/shared/contracts/acquisition'
import { CSRF_COOKIE_NAME } from '#shared/app'
import { createApiTransport, isInternalApiPath, type ApiFetcher } from '~~/shared/api-transport'

function getCsrfTokenFromCookie(): string | null {
  if (typeof document === 'undefined') return null
  // h3.getCookie exige um H3Event (server-side); aqui lemos document.cookie.
  const cookie = document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${CSRF_COOKIE_NAME}=`))
    ?.slice(CSRF_COOKIE_NAME.length + 1)
  if (!cookie) return null
  const [token] = cookie.split('.')
  return token || null
}

export function useApiFetch() {
  const fetcher: ApiFetcher = (url, options) => {
    const requestFetch = import.meta.server && isInternalApiPath(url) ? useRequestFetch() : $fetch
    return requestFetch(url, options)
  }
  return createApiTransport(fetcher, getCsrfTokenFromCookie)
}

export function useAuthFetch() {
  const api = useApiFetch()

  return {
    login: (email: string, password: string, rememberMe = false) =>
      api('/api/auth/login', { method: 'POST', body: { email, password, rememberMe } }),
    register: (
      email: string,
      password: string,
      name: string,
      consentTermsVersion: string,
      acquisitionChannel?: AcquisitionChannel,
    ) =>
      api('/api/auth/register', {
        method: 'POST',
        body: { email, password, name, consentTermsVersion, acquisitionChannel },
      }),
    logout: () => api('/api/auth/logout', { method: 'POST' }),
    verifyEmail: (token: string) =>
      api('/api/auth/email/verification/confirm', { method: 'POST', body: { token } }),
    forgetPassword: (email: string) =>
      api('/api/auth/password/forgot', { method: 'POST', body: { email } }),
    resetPassword: (token: string, newPassword: string) =>
      api('/api/auth/password/reset', { method: 'POST', body: { token, newPassword } }),
    sendVerificationEmail: (email: string) =>
      api('/api/auth/email/verification', { method: 'POST', body: { email } }),
    deactivate: () => api('/api/v1/me/deactivate', { method: 'POST' }),
    withdrawConsent: () => api('/api/v1/me/consents/withdraw', { method: 'POST' }),
    me: () => api('/api/v1/me'),
  }
}
