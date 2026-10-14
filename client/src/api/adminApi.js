import { httpClient } from './httpClient.js';

export async function getAdminDashboard({ signal } = {}) {
  const { data } = await httpClient.get('/admin/dashboard', { signal });
  const arrays = ['revenueByCategory', 'topProducts', 'orderStatusBreakdown'];
  if (!data || data.status !== 'success' || arrays.some((key) => !Array.isArray(data[key]))) {
    throw new Error('The analytics service returned an unexpected response.');
  }
  return data;
}
