import { apiUrls, createApiClient } from '@pm/shared';

/** В dev и в проде api доступен по /api (прокси Vite и nginx), для отдельного хоста — VITE_API_URL. */
export const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

export const api = createApiClient({ baseUrl: API_BASE });
export const urls = apiUrls(API_BASE);
