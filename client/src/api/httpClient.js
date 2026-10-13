import axios from 'axios';
import { API_BASE_URL } from '../config/environment.js';
import { clearAccessToken, getAccessToken, getTokenRevision } from './tokenStore.js';
import { notifySessionInvalidated } from './sessionEvents.js';

export class ApiError extends Error {
  constructor({ message, kind, status = null, code = null, details = null }) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function normalizeApiError(error) {
  if (error instanceof ApiError) return error;
  const status = error?.response?.status ?? null;
  const payload = error?.response?.data;
  const message = typeof payload?.message === 'string' && payload.message.trim()
    ? payload.message.trim()
    : error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT'
      ? 'The request timed out. Please try again.'
      : status === null
        ? 'The service could not be reached. Check your connection and try again.'
        : status >= 500
          ? 'The service is temporarily unavailable. Please try again.'
          : 'The request could not be completed.';
  const kind = status === 400 ? 'validation'
    : status === 401 ? 'unauthorized'
      : status === 403 ? 'forbidden'
        : status >= 500 ? 'server'
          : status === null ? (error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT' ? 'timeout' : 'network')
            : 'request';
  // Only retain the server's user-facing message. Axios request/config/headers may contain secrets.
  return new ApiError({ message, kind, status, code: typeof error?.code === 'string' ? error.code : null });
}

export const httpClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: { Accept: 'application/json', 'Content-Type': 'application/json' }
});

httpClient.interceptors.request.use((config) => {
  if (config.skipAuth) return config;
  const token = getAccessToken();
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`);
    config.sessionTokenRevision = getTokenRevision();
  } else {
    config.headers.delete('Authorization');
  }
  return config;
});

httpClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const config = error?.config;
    const failedRevision = config?.sessionTokenRevision;
    if (error?.response?.status === 401 && !config?.skipAuth && Number.isInteger(failedRevision)) {
      // Ignore an old response if the user has since logged in as a new session.
      if (clearAccessToken(failedRevision)) {
        notifySessionInvalidated({ invalidatedRevision: failedRevision, nextRevision: getTokenRevision() });
      }
    }
    return Promise.reject(normalizeApiError(error));
  }
);
