import { httpClient } from './httpClient.js';

export async function submitCheckout(key) {
  const { data } = await httpClient.post('/cart/checkout', {}, {
    headers: { 'Idempotency-Key': key }
  });
  return data;
}

export async function reconcileCheckout(key) {
  const { data } = await httpClient.get(`/cart/checkout/${encodeURIComponent(key)}`);
  return data;
}
