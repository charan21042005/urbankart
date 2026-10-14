import { httpClient } from './httpClient.js';
import { getProducts } from './productApi.js';

export async function getAdminDashboard({ signal } = {}) {
  const { data } = await httpClient.get('/admin/dashboard', { signal });
  const arrays = ['revenueByCategory', 'topProducts', 'orderStatusBreakdown'];
  if (!data || data.status !== 'success' || arrays.some((key) => !Array.isArray(data[key]))) {
    throw new Error('The analytics service returned an unexpected response.');
  }
  return data;
}

export async function getAdminOverview({ signal } = {}) {
  const { data } = await httpClient.get('/admin/overview', { signal });
  if (!data || data.status !== 'success' || !data.metrics) throw new Error('The overview service returned an unexpected response.');
  return data.metrics;
}

export async function getAdminUsers({ page = 1, search = '', signal } = {}) {
  const { data } = await httpClient.get('/admin/users', { params: { page, limit: 20, ...(search ? { search } : {}) }, signal });
  return data;
}

export async function getAdminUserCart(id, { signal } = {}) {
  const { data } = await httpClient.get(`/admin/users/${encodeURIComponent(id)}/cart`, { signal });
  return data;
}

export async function getAdminUser(id, { signal } = {}) {
  const { data } = await httpClient.get(`/admin/users/${encodeURIComponent(id)}`, { signal });
  return data.user;
}

export async function getAdminOrders({ page = 1, signal } = {}) {
  const { data } = await httpClient.get('/admin/orders', { params: { page, limit: 20 }, signal });
  return data;
}

export async function getAdminOrder(id, { signal } = {}) {
  const { data } = await httpClient.get(`/admin/orders/${encodeURIComponent(id)}`, { signal });
  return data.order;
}

export async function getAdminReviews({ page = 1, signal } = {}) {
  const { data } = await httpClient.get('/admin/reviews', { params: { page, limit: 20 }, signal });
  return data;
}

export async function getAdminProducts({ page = 1, search = '', category = '', signal } = {}) {
  return getProducts({ page, limit: 20, search, category, signal });
}

export async function createAdminProduct(product) {
  const { data } = await httpClient.post('/products', product);
  return data;
}

export async function updateAdminProduct(id, product) {
  const { data } = await httpClient.patch(`/products/${encodeURIComponent(id)}`, product);
  return data;
}

export async function deleteAdminProduct(id) {
  const { data } = await httpClient.delete(`/products/${encodeURIComponent(id)}`);
  return data;
}
