import { httpClient } from './httpClient.js';

function readCount(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

export async function getProducts({ page = 1, limit = 20, search = '', category = '', sort = 'available', signal } = {}) {
  const { data, headers } = await httpClient.get('/products', {
    params: { page, limit, ...(search ? { search } : {}), ...(category ? { category } : {}), ...(sort !== 'newest' ? { sort } : {}) },
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

export async function getCategories({ signal } = {}) {
  const { data } = await httpClient.get('/products/categories', { signal });
  if (!Array.isArray(data) || data.some((category) => typeof category !== 'string')) {
    throw new Error('The category service returned an unexpected response.');
  }
  return data;
}

export async function getProduct(id, { signal } = {}) {
  const { data } = await httpClient.get(`/products/${encodeURIComponent(id)}`, { signal });
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('The product service returned an unexpected response.');
  }
  return data;
}

export async function getRecommendations(id, { signal } = {}) {
  const { data } = await httpClient.get(`/products/${encodeURIComponent(id)}/recommendations`, { signal });
  if (!data || data.status !== 'success' || !['recommendation-engine', 'fallback'].includes(data.source)
      || !Array.isArray(data.items)) {
    throw new Error('The recommendation service returned an unexpected response.');
  }
  const items = data.items.filter((item) => item?.product && typeof item.product._id === 'string'
    && (item.score === null || (Number.isFinite(item.score) && item.score >= 0 && item.score <= 1)));
  return { source: data.source, computedAt: data.computedAt || null, items };
}
