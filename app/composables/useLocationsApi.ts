export function useLocationsApi() {
  const api = useApiFetch()

  return {
    list: (companyId: string) => api(`/api/v1/companies/${companyId}/locations`),
    create: (companyId: string, name: string) =>
      api(`/api/v1/companies/${companyId}/locations`, { method: 'POST', body: { name } }),
    update: (companyId: string, locationId: string, body: unknown) =>
      api(`/api/v1/companies/${companyId}/locations/${locationId}`, { method: 'PATCH', body }),
    deactivate: (companyId: string, locationId: string) =>
      api(`/api/v1/companies/${companyId}/locations/${locationId}`, { method: 'DELETE' }),
  }
}
