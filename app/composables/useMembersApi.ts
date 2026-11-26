export function useMembersApi() {
  const api = useApiFetch()

  return {
    list: (companyId: string) => api(`/api/v1/companies/${companyId}/members`),
    remove: (companyId: string, userId: string) =>
      api(`/api/v1/companies/${companyId}/members/${userId}`, { method: 'DELETE' }),
  }
}
