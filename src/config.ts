export const config = {
  keycloak: {
    url: import.meta.env.VITE_KEYCLOAK_URL ?? '/idp',
    realm: import.meta.env.VITE_KEYCLOAK_REALM ?? 'lad',
    clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID ?? 'web',
  },
  apiBase: import.meta.env.VITE_API_BASE ?? '/api/v1',
  /** Усі «сьогодні», ISO-тижні й «не раніше ніж через 7 днів» — у цій зоні (розділ 04). */
  timeZone: 'Europe/Kyiv',
  /** effective_from не раніше ніж через N днів (параметр сервера; тут — для підказки у формі). */
  publishMinDaysAhead: 7,
  /** Інтервал опитування GET /jobs/{job_id}. */
  jobPollMs: 1500,
} as const;
