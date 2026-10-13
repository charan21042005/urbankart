import { httpClient } from './httpClient.js';

export async function login(credentials) {
  const { email, password } = credentials || {};
  const { data } = await httpClient.post('/auth/login', { email, password }, { skipAuth: true });
  return data;
}

export async function register(details) {
  const { name, email, password } = details || {};
  // Only send fields accepted by the public customer-registration contract.
  const { data } = await httpClient.post('/auth/register', { name, email, password }, { skipAuth: true });
  return data;
}
