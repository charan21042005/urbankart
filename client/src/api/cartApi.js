import { httpClient } from './httpClient.js';

export function normalizeCart(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !Array.isArray(payload.items)) {
    throw new Error('The cart service returned an unexpected response.');
  }
  const items = payload.items.map((item) => {
    if (!item || typeof item !== 'object' || !Number.isSafeInteger(item.quantity) || item.quantity <= 0) {
      throw new Error('The cart service returned an unexpected response.');
    }
    const productValue = item?.productId;
    const product = productValue && typeof productValue === 'object' ? productValue : null;
    const productId = product?._id ?? productValue ?? null;
    if (productId !== null && typeof productId !== 'string') {
      throw new Error('The cart service returned an unexpected response.');
    }
    return {
      productId,
      quantity: item.quantity,
      product
    };
  });
  return { items };
}

export async function getCart({ signal } = {}) {
  const { data } = await httpClient.get('/cart', { signal });
  return normalizeCart(data);
}

export async function addCartItem(productId, quantity) {
  const { data } = await httpClient.post('/cart/items', { productId, quantity });
  return data;
}

export async function setCartItemQuantity(productId, quantity) {
  const { data } = await httpClient.patch(`/cart/items/${encodeURIComponent(productId)}`, { quantity });
  return data;
}

export async function removeCartItem(productId) {
  const { data } = await httpClient.delete(`/cart/items/${encodeURIComponent(productId)}`);
  return data;
}

export async function clearCart() {
  const { data } = await httpClient.delete('/cart');
  return data;
}
