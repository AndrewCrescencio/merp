import { companyUpdateSchema } from '~~/shared/contracts/company'

export function useCompaniesApi() {
  const api = useApiFetch()

  return {
    createCompany: (name: string) => api('/api/v1/companies', { method: 'POST', body: { name } }),
    getCompanies: (q?: string) =>
      api('/api/v1/companies', { method: 'GET', query: q ? { q } : undefined }),
    updateCompany: (companyId: string, input: unknown) => {
      const body = companyUpdateSchema.parse(input)
      return api(`/api/v1/companies/${companyId}`, { method: 'PATCH', body })
    },
    deleteCompany: (companyId: string) =>
      api(`/api/v1/companies/${companyId}`, { method: 'DELETE' }),
    inviteMember: (companyId: string, email: string) =>
      api(`/api/v1/companies/${companyId}/invitations`, { method: 'POST', body: { email } }),
    getInvites: (companyId: string) =>
      api(`/api/v1/companies/${companyId}/invitations`, { method: 'GET' }),
    acceptInvite: (token: string) =>
      api('/api/v1/me/invitations/accept', { method: 'POST', body: { token } }),
  }
}
