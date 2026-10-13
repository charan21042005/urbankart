import { afterEach, describe, expect, it, vi } from 'vitest';
import { httpClient } from '../api/httpClient.js';
import { reconcileCheckout, submitCheckout } from '../api/checkoutApi.js';

vi.mock('../api/httpClient.js', () => ({
  httpClient: { post: vi.fn(), get: vi.fn() }
}));

afterEach(() => vi.clearAllMocks());

describe('checkout API contract', () => {
  it('sends the idempotency key in the required request header', async () => {
    httpClient.post.mockResolvedValue({ data: { status: 'success' } });
    await submitCheckout('client-attempt-key-0001');
    expect(httpClient.post).toHaveBeenCalledWith('/cart/checkout', {}, {
      headers: { 'Idempotency-Key': 'client-attempt-key-0001' }
    });
  });

  it('URL-encodes the key in the authenticated reconciliation path', async () => {
    httpClient.get.mockResolvedValue({ data: { status: 'success' } });
    await reconcileCheckout('attempt key/with reserved');
    expect(httpClient.get).toHaveBeenCalledWith('/cart/checkout/attempt%20key%2Fwith%20reserved');
  });
});
