import { httpClient } from './httpClient.js';

export async function getProductReviews(productId, { signal } = {}) {
  const { data } = await httpClient.get(`/reviews/product/${encodeURIComponent(productId)}`, { signal });
  if (!data || data.status !== 'success' || !Array.isArray(data.reviews)) {
    throw new Error('The review service returned an unexpected response.');
  }
  return data.reviews;
}

export async function createProductReview({ productId, rating, text }) {
  const { data } = await httpClient.post('/reviews', { productId, rating, text });
  if (!data || data.status !== 'success' || !data.review?._id) {
    throw new Error('The review service returned an unexpected response.');
  }
  return data.review;
}
