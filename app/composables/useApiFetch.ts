const CSRF_COOKIE_NAME = 'merp-csrf_token'
const CSRF_HEADER_NAME = 'x-csrf-token'

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
  return async <T>(url: string, options: Record<string, unknown> = {}): Promise<T> => {
    const csrfToken = getCsrfTokenFromCookie()

    const headers = new Headers(options.headers as HeadersInit)
    if (csrfToken && !headers.has(CSRF_HEADER_NAME)) {
      headers.set(CSRF_HEADER_NAME, csrfToken)
    }

    try {
      // url é string dinâmica: a resposta é o payload do servidor, sem reescrita
      // de tipos de rota — TypedInternalResponse se resume a T em runtime.
      return (await $fetch<T>(url, { ...options, headers })) as T
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
    me: () => api('/api/v1/me'),
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
    createCompany: (name: string, cnpj?: string, razaoSocial?: string) =>
      api('/api/v1/companies', { method: 'POST', body: { name, cnpj, razaoSocial } }),
    getCompanies: (q?: string) =>
      api('/api/v1/companies', { method: 'GET', query: q ? { q } : undefined }),
    // R1: companyId vive no path, nunca no body.
    updateCompany: (
      companyId: string,
      data: { name?: string; cnpj?: string; razaoSocial?: string },
    ) => api(`/api/v1/companies/${companyId}`, { method: 'PATCH', body: data }),
    deleteCompany: (companyId: string) =>
      api(`/api/v1/companies/${companyId}`, { method: 'DELETE' }),
    inviteMember: (companyId: string, email: string) =>
      api(`/api/v1/companies/${companyId}/invitations`, { method: 'POST', body: { email } }),
    getInvites: (companyId: string) =>
      api('/api/v1/me/invitations', { method: 'GET', query: { companyId } }),
    acceptInvite: (token: string) =>
      api('/api/v1/me/invitations/accept', { method: 'POST', body: { token } }),
    // userId no path; omitir não existe mais — para sair, passe o próprio id.
    removeMember: (companyId: string, userId: string) =>
      api(`/api/v1/companies/${companyId}/members/${userId}`, { method: 'DELETE' }),
  }
}
