import { getCookie } from 'h3'

const CSRF_COOKIE_NAME = 'merp-csrf_token'
const CSRF_HEADER_NAME = 'x-csrf-token'

function getCsrfTokenFromCookie(): string | null {
  if (typeof document === 'undefined') return null
  const cookie = getCookie(CSRF_COOKIE_NAME)
  if (!cookie) return null
  const [token] = cookie.split('.')
  return token || null
}

export function useApiFetch() {
  return async <T>(url: string, options: Record<string, unknown> = {}): Promise<T> => {
    const csrfToken = getCsrfTokenFromCookie()

    const headers = new Headers(options.headers as HeadersInit)
    if (csrfToken && !headers.has(CSRF_HEADER_NAME)) {
      headers.set(CSRF_HEADER_NAME, csrfToken)
    }

    try {
      return await $fetch<T>(url, { ...options, headers })
    } catch (error: unknown) {
      const err = error as { data?: unknown; status?: number }
      if (err.data && typeof err.data === 'object' && 'error' in err.data) {
        const data = err.data as { error: string; message?: string }
        throw Object.assign(new Error(data.message || 'Request failed'), {
          code: data.error,
          status: err.status,
          data: err.data,
        })
      }
      throw error
    }
  }
}

export function useAuthFetch() {
  const api = useApiFetch()

  return {
    login: (email: string, password: string, rememberMe = false) =>
      api('/api/auth/login', { method: 'POST', body: { email, password, rememberMe } }),
    register: (email: string, password: string, name: string, consentTermsVersion: string) =>
      api('/api/auth/register', {
        method: 'POST',
        body: { email, password, name, consentTermsVersion },
      }),
    logout: () => api('/api/auth/logout', { method: 'POST' }),
    me: () => api('/api/auth/me'),
    verifyEmail: (token: string) =>
      api('/api/auth/verify-email', { method: 'GET', query: { token } }),
    forgetPassword: (email: string) =>
      api('/api/auth/forget-password', { method: 'POST', body: { email } }),
    resetPassword: (token: string, newPassword: string) =>
      api('/api/auth/reset-password', { method: 'POST', body: { token, newPassword } }),
    sendVerificationEmail: (email: string) =>
      api('/api/auth/send-verification-email', { method: 'POST', body: { email } }),
    deactivate: () => api('/api/auth/deactivate', { method: 'POST' }),
    withdrawConsent: () => api('/api/auth/consent/withdraw', { method: 'POST' }),
    createCompany: (name: string, cnpj?: string, razaoSocial?: string) =>
      api('/api/auth/companies', { method: 'POST', body: { name, cnpj, razaoSocial } }),
    getCompanies: (q?: string) =>
      api('/api/auth/companies', { method: 'GET', query: q ? { q } : undefined }),
    updateCompany: (
      companyId: string,
      data: { name?: string; cnpj?: string; razaoSocial?: string },
    ) => api('/api/auth/companies', { method: 'POST', body: { companyId, ...data } }),
    deleteCompany: (companyId: string) =>
      api('/api/auth/companies', { method: 'DELETE', body: { companyId } }),
    switchCompany: (companyId: string) =>
      api('/api/auth/companies/switch', { method: 'POST', body: { companyId } }),
    inviteMember: (companyId: string, email: string) =>
      api('/api/auth/invite', { method: 'POST', body: { companyId, email } }),
    getInvites: (companyId: string) =>
      api('/api/auth/invites', { method: 'GET', query: { companyId } }),
    acceptInvite: (token: string) =>
      api('/api/auth/invites/accept', { method: 'POST', body: { token } }),
    removeMember: (companyId: string, userId?: string) =>
      api('/api/auth/companies/members', { method: 'DELETE', body: { companyId, userId } }),
  }
}
