import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import App from '../App.jsx';
import { AuthProvider } from '../auth/AuthContext.jsx';
import { CartProvider } from '../cart/CartContext.jsx';
import { clearAccessToken } from '../api/tokenStore.js';
import { getCart } from '../api/cartApi.js';
import { login } from '../api/authApi.js';
import { reconcileCheckout, submitCheckout } from '../api/checkoutApi.js';

vi.mock('../api/cartApi.js', () => ({
  getCart: vi.fn(), addCartItem: vi.fn(), setCartItemQuantity: vi.fn(), removeCartItem: vi.fn(), clearCart: vi.fn()
}));
vi.mock('../api/authApi.js', () => ({ login: vi.fn(), register: vi.fn() }));
vi.mock('../api/checkoutApi.js', () => ({ reconcileCheckout: vi.fn(), submitCheckout: vi.fn() }));

const selection = { items: [{ productId: '65a0a1b2c3d4e5f607182930', quantity: 1, product: { _id: '65a0a1b2c3d4e5f607182930', name: 'Canvas carryall', price: 42.5, stock: 3, category: 'Accessories' } }] };
const order = { _id: 'order-verified-1', totalAmount: 42.5, items: [{ productId: '65a0a1b2c3d4e5f607182930', nameAtPurchase: 'Canvas carryall', priceAtPurchase: 42.5, qty: 1 }] };

function wrapper({ children }) {
  return <AuthProvider><CartProvider><MemoryRouter initialEntries={['/checkout']}>{children}</MemoryRouter></CartProvider></AuthProvider>;
}

async function openAuthenticatedCheckout() {
  login.mockResolvedValue({ status: 'success', token: 'memory-only-token', user: { id: 'user-stage-h', name: 'Shopper', email: 'shopper@example.test', role: 'customer' } });
  getCart.mockResolvedValue(selection);
  render(<App />, { wrapper });
  fireEvent.click(within(screen.getByRole('main')).getByRole('link', { name: 'Sign in' }));
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'shopper@example.test' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct-horse' } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  await screen.findByRole('button', { name: 'Sign out' });
  await screen.findByRole('heading', { name: 'Checkout' });
  await screen.findByRole('button', { name: 'Place order' });
  expect(screen.getByText('Mock checkout only: this records an order without processing payment or delivery.')).toBeTruthy();
}

beforeEach(() => {
  clearAccessToken();
  sessionStorage.clear();
  login.mockReset(); getCart.mockReset(); submitCheckout.mockReset(); reconcileCheckout.mockReset();
  getCart.mockResolvedValue({ items: [] });
});

describe('Stage H checkout flow', () => {
  it('requires authentication and does not expose order details to a guest', async () => {
    render(<App />, { wrapper });
    expect(await screen.findByRole('heading', { name: 'Sign in to continue.' })).toBeTruthy();
    expect(within(screen.getByRole('main')).getByRole('link', { name: 'Sign in' })).toBeTruthy();
    expect(submitCheckout).not.toHaveBeenCalled();
    expect(reconcileCheckout).not.toHaveBeenCalled();
  });

  it('creates one secure attempt key, blocks duplicate clicks, and confirms only the API order', async () => {
    await openAuthenticatedCheckout();
    let finish;
    submitCheckout.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    fireEvent.click(screen.getByRole('button', { name: 'Place order' }));
    const pendingButton = await screen.findByRole('button', { name: 'Placing order…' });
    expect(pendingButton.disabled).toBe(true);
    fireEvent.click(pendingButton);
    await waitFor(() => expect(submitCheckout).toHaveBeenCalledTimes(1));
    const firstKey = submitCheckout.mock.calls[0][0];
    expect(firstKey).toMatch(/^[0-9a-f-]{36}$/i);
    expect(sessionStorage.getItem('urbankart.checkout.pending.user-stage-h')).toBe(firstKey);
    expect(screen.queryByText(/memory-only-token/)).toBeNull();
    finish({ status: 'success', replayed: false, order });
    expect(await screen.findByText('Order reference')).toBeTruthy();
    expect(await screen.findByText('order-verified-1')).toBeTruthy();
    expect(screen.getByText('Server-confirmed total')).toBeTruthy();
    expect(screen.getByText('Mock checkout complete. This synthetic order is recorded, but no payment or delivery was processed.')).toBeTruthy();
    await waitFor(() => expect(getCart).toHaveBeenCalledTimes(2));
  });

  it('reconciles an ambiguous result and retries with the same key', async () => {
    await openAuthenticatedCheckout();
    const networkError = new Error('timeout');
    submitCheckout.mockRejectedValueOnce(networkError).mockResolvedValueOnce({ status: 'success', replayed: true, order });
    reconcileCheckout.mockRejectedValueOnce(Object.assign(new Error('not found'), { response: { status: 404 } }));
    fireEvent.click(screen.getByRole('button', { name: 'Place order' }));
    expect(await screen.findByRole('button', { name: 'Retry same checkout attempt' })).toBeTruthy();
    const key = submitCheckout.mock.calls[0][0];
    expect(reconcileCheckout).toHaveBeenCalledWith(key);
    expect(getCart).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Retry same checkout attempt' }));
    expect(await screen.findByText('order-verified-1')).toBeTruthy();
    expect(submitCheckout.mock.calls.map(([requestKey]) => requestKey)).toEqual([key, key]);
    await waitFor(() => expect(getCart).toHaveBeenCalledTimes(2));
  });

  it('uses a saved attempt key to reconcile after re-entry and displays no false success', async () => {
    login.mockResolvedValue({ status: 'success', token: 'memory-only-token', user: { id: 'user-stage-h', name: 'Shopper', email: 'shopper@example.test', role: 'customer' } });
    sessionStorage.setItem('urbankart.checkout.pending.user-stage-h', 'saved-attempt-key-001');
    reconcileCheckout.mockResolvedValue({ status: 'success', replayed: true, order });
    getCart.mockResolvedValue({ items: [] });
    render(<App />, { wrapper });
    fireEvent.click(within(screen.getByRole('main')).getByRole('link', { name: 'Sign in' }));
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'shopper@example.test' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct-horse' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByRole('button', { name: 'Sign out' });
    expect(await screen.findByText('order-verified-1')).toBeTruthy();
    expect(reconcileCheckout).toHaveBeenCalledWith('saved-attempt-key-001');
    expect(submitCheckout).not.toHaveBeenCalled();
  });

  it('shows a definitive stock conflict without claiming success', async () => {
    await openAuthenticatedCheckout();
    submitCheckout.mockRejectedValue(Object.assign(new Error('stock conflict'), {
      response: { status: 409, data: { message: 'A cart product is unavailable.' } }
    }));
    fireEvent.click(screen.getByRole('button', { name: 'Place order' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText('Order confirmed')).toBeNull();
    expect(reconcileCheckout).not.toHaveBeenCalled();
    expect(getCart).toHaveBeenCalledTimes(1);
  });
});
