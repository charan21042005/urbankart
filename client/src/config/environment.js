const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();

// Public browser configuration only; do not add secrets to VITE_ variables.
export const API_BASE_URL = (configuredApiBaseUrl || '/api').replace(/\/+$/, '');
