import { httpClient } from './httpClient.js';

function readCount(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

export async function getProducts({ page = 1, limit = 20, search = '', category = '', signal } = {}) {
  const { data, headers } = await httpClient.get('/products', {
    params: { page, limit, ...(search ? { search } : {}), ...(category ? { category } : {}) },
    signal
  });
  if (!Array.isArray(data)) throw new Error('The product service returned an unexpected response.');
  return {
    products: data,
    pagination: {
      totalCount: readCount(headers['x-total-count']),
      page: readCount(headers['x-page']),
      pageSize: readCount(headers['x-page-size']),
      totalPages: readCount(headers['x-total-pages'])
    }
  };
}

export async function getProduct(id, { signal } = {}) {
  const { data } = await httpClient.get(`/products/${encodeURIComponent(id)}`, { signal });
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('The product service returned an unexpected response.');
  }
  return data;
}
