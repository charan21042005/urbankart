import { httpClient } from './httpClient.js';

export function normalizeCart(payload) {
  const sourceItems = Array.isArray(payload?.items) ? payload.items : [];
  const items = sourceItems.map((item) => {
    const productValue = item?.productId;
    const product = productValue && typeof productValue === 'object' ? productValue : null;
    return {
      productId: product?._id ?? productValue ?? null,
      quantity: Number.isSafeInteger(item?.quantity) && item.quantity > 0 ? item.quantity : 0,
      product
    };
  }).filter((item) => item.quantity > 0);
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
