import { httpClient } from './httpClient.js';

export async function updateMyProfile(name) {
  const { data } = await httpClient.patch('/users/me', { name });
  return data;
}

export async function getMyOrders({ page = 1, limit = 10, signal } = {}) {
  const { data } = await httpClient.get('/users/me/orders', { params: { page, limit }, signal });
  if (!data || !Array.isArray(data.orders) || !Number.isInteger(data.page)
      || !Number.isInteger(data.total) || !Number.isInteger(data.totalPages)) {
    throw new Error('The account service returned an unexpected order response.');
  }
  return data;
}
