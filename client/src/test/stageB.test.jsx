import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App.jsx';
import { AuthProvider, useAuth } from '../auth/AuthContext.jsx';
import { CartProvider, useCart } from '../cart/CartContext.jsx';
import { API_BASE_URL } from '../config/environment.js';
import { httpClient, normalizeApiError } from '../api/httpClient.js';
import { getAccessToken, clearAccessToken, setAccessToken } from '../api/tokenStore.js';
import { addCartItem, getCart, normalizeCart } from '../api/cartApi.js';
import { login, register } from '../api/authApi.js';
import { MemoryRouter } from 'react-router';

vi.mock('../api/authApi.js', () => ({ login: vi.fn(), register: vi.fn() }));
vi.mock('../api/cartApi.js', async (importOriginal) => ({ ...(await importOriginal()), addCartItem: vi.fn(), getCart: vi.fn() }));

const success = (id = 'user-1') => ({
  status: 'success', token: `opaque-${id}`, user: { id, name: 'A User', email: `${id}@example.test`, role: 'customer' }
});
const authWrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>;
const appWrapper = ({ children }) => (
  <AuthProvider><CartProvider><MemoryRouter initialEntries={['/']}>{children}</MemoryRouter></CartProvider></AuthProvider>
);

beforeEach(() => {
  clearAccessToken();
  login.mockReset();
  register.mockReset();
  getCart.mockReset();
});
afterEach(() => clearAccessToken());

describe('HTTP layer', () => {
  it('uses the configured API base URL and omits authorization without a token', async () => {
    expect(httpClient.defaults.baseURL).toBe(API_BASE_URL);
    let captured;
    httpClient.defaults.adapter = async (config) => {
      captured = config;
      return { data: { ok: true }, status: 200, statusText: 'OK', headers: {}, config };
    };
    await httpClient.get('/cart');
    expect(captured.headers.get('Authorization')).toBeUndefined();
  });

  it('attaches the current bearer token and stops attaching it after logout', async () => {
    const seen = [];
    httpClient.defaults.adapter = async (config) => {
      seen.push(config.headers.get('Authorization'));
      return { data: {}, status: 200, statusText: 'OK', headers: {}, config };
    };
    setAccessToken('test-access-token');
    await httpClient.get('/cart');
    clearAccessToken();
    await httpClient.get('/cart');
    expect(seen).toEqual(['Bearer test-access-token', undefined]);
  });

  it('preserves useful server messages and does not retain request details', () => {
    const normalized = normalizeApiError({ response: { status: 400, data: { message: 'A valid email address is required.' } }, config: { headers: { Authorization: 'secret' } } });
    expect(normalized.message).toBe('A valid email address is required.');
    expect(normalized.kind).toBe('validation');
    expect(JSON.stringify(normalized)).not.toContain('secret');
  });

  it('normalizes the populated product reference returned by the cart endpoint', () => {
    expect(normalizeCart({ items: [{ productId: { _id: 'p-1', name: 'Item', price: 12, stock: 4, category: 'Home' }, quantity: 2 }] })).toEqual({
      items: [{ productId: 'p-1', quantity: 2, product: { _id: 'p-1', name: 'Item', price: 12, stock: 4, category: 'Home' } }]
    });
  });

  it('rejects malformed cart responses instead of presenting them as an empty cart', () => {
    expect(() => normalizeCart({})).toThrow('The cart service returned an unexpected response.');
    expect(() => normalizeCart({ items: [{ productId: 'p-1', quantity: 0 }] })).toThrow('The cart service returned an unexpected response.');
  });

  it('does not treat a public login 401 as an invalidation of another session', async () => {
    setAccessToken('keep-token');
    const notify = vi.fn();
    let authorization;
    const { subscribeToSessionInvalidation } = await import('../api/sessionEvents.js');
    const unsubscribe = subscribeToSessionInvalidation(notify);
    httpClient.defaults.adapter = async (config) => {
      authorization = config.headers.get('Authorization');
      const error = new axios.AxiosError('unauthorized', 'ERR_BAD_REQUEST', config, null, {
        status: 401, data: { status: 'error', message: 'Invalid email or password.' }, headers: {}, config
      });
      throw error;
    };
    await expect(httpClient.post('/auth/login', {}, { skipAuth: true })).rejects.toMatchObject({ status: 401, message: 'Invalid email or password.' });
    expect(getAccessToken()).toBe('keep-token');
    expect(authorization).toBeUndefined();
    expect(notify).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('invalidates the matching authenticated session after a protected 401', async () => {
    const notify = vi.fn();
    const { subscribeToSessionInvalidation } = await import('../api/sessionEvents.js');
    const unsubscribe = subscribeToSessionInvalidation(notify);
    setAccessToken('expired-token');
    httpClient.defaults.adapter = async (config) => {
      throw new axios.AxiosError('unauthorized', 'ERR_BAD_REQUEST', config, null, {
        status: 401, data: { message: 'Invalid or expired token.' }, headers: {}, config
      });
    };
    await expect(httpClient.get('/cart')).rejects.toMatchObject({ status: 401, kind: 'unauthorized' });
    expect(getAccessToken()).toBeNull();
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ invalidatedRevision: expect.any(Number) }));
    unsubscribe();
  });

  it('does not let an old protected 401 clear a newer login token', async () => {
    let rejectOldRequest;
    httpClient.defaults.adapter = (config) => new Promise((resolve, reject) => {
      rejectOldRequest = () => reject(new axios.AxiosError('unauthorized', 'ERR_BAD_REQUEST', config, null, {
        status: 401, data: { message: 'Invalid or expired token.' }, headers: {}, config
      }));
    });
    setAccessToken('old-token');
    const pending = httpClient.get('/cart');
    await waitFor(() => expect(rejectOldRequest).toBeDefined());
    setAccessToken('new-token');
    rejectOldRequest();
    await expect(pending).rejects.toMatchObject({ status: 401 });
    expect(getAccessToken()).toBe('new-token');
  });
});

describe('authentication context', () => {
  it('starts unauthenticated without making a profile request', async () => {
    setAccessToken('unverified-token');
    const { result } = renderHook(() => useAuth(), { wrapper: authWrapper });
    await waitFor(() => expect(result.current.status).toBe('unauthenticated'));
    expect(result.current.user).toBeNull();
    expect(getAccessToken()).toBeNull();
  });

  it('stores a valid login response and exposes the current user', async () => {
    login.mockResolvedValue(success());
    const { result } = renderHook(() => useAuth(), { wrapper: authWrapper });
    await act(async () => { expect(await result.current.login({ email: 'user@example.test', password: 'password' })).toBe(true); });
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user.email).toBe('user-1@example.test');
    expect(getAccessToken()).toBe('opaque-user-1');
  });

  it('keeps login errors visible without authenticating', async () => {
    login.mockRejectedValue(Object.assign(new Error('Invalid email or password.'), { kind: 'unauthorized', status: 401 }));
    const { result } = renderHook(() => useAuth(), { wrapper: authWrapper });
    await act(async () => { expect(await result.current.login({ email: 'user@example.test', password: 'wrongpass' })).toBe(false); });
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.error.message).toBe('Invalid email or password.');
  });

  it('registers using the returned token and handles validation failures', async () => {
    register.mockResolvedValueOnce(success('new-user'));
    const { result } = renderHook(() => useAuth(), { wrapper: authWrapper });
    await act(async () => { await result.current.register({ name: 'A User', email: 'new@example.test', password: 'password' }); });
    expect(result.current.user.id).toBe('new-user');
    expect(register).toHaveBeenCalledWith({ name: 'A User', email: 'new@example.test', password: 'password' });

    register.mockRejectedValueOnce(Object.assign(new Error('A valid email address is required.'), { kind: 'validation', status: 400 }));
    await act(async () => { await result.current.register({ name: 'A User', email: 'bad', password: 'password' }); });
    expect(result.current.error.message).toBe('A valid email address is required.');
  });

  it('logs out locally and clears the token', async () => {
    login.mockResolvedValue(success());
    const { result } = renderHook(() => useAuth(), { wrapper: authWrapper });
    await act(async () => { await result.current.login({ email: 'user@example.test', password: 'password' }); });
    act(() => result.current.logout());
    expect(result.current.status).toBe('unauthenticated');
    expect(result.current.user).toBeNull();
    expect(getAccessToken()).toBeNull();
  });

  it('clears the matching local session when the HTTP layer reports invalidation', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: authWrapper });
    login.mockResolvedValue(success());
    await act(async () => { await result.current.login({ email: 'user@example.test', password: 'password' }); });
    const { notifySessionInvalidated } = await import('../api/sessionEvents.js');
    const invalidatedRevision = result.current.sessionRevision;
    clearAccessToken(invalidatedRevision);
    act(() => notifySessionInvalidated({ invalidatedRevision, nextRevision: invalidatedRevision + 1 }));
    expect(result.current.status).toBe('unauthenticated');
    expect(result.current.user).toBeNull();
    expect(getAccessToken()).toBeNull();
  });

  it('throws a clear error when the hook is outside its provider', () => {
    expect(() => renderHook(() => useAuth())).toThrow('useAuth must be used within an AuthProvider.');
  });
});

describe('cart context', () => {
  it('does not request cart data while signed out and exposes empty data', async () => {
    getCart.mockResolvedValue({ items: [] });
    const { result } = renderHook(() => useCart(), { wrapper: appWrapper });
    await waitFor(() => expect(result.current.status).toBe('idle'));
    expect(getCart).not.toHaveBeenCalled();
    expect(result.current.itemCount).toBe(0);
  });

  it('loads the authenticated cart and derives count and display total', async () => {
    login.mockResolvedValue(success());
    getCart.mockResolvedValue({ items: [
      { productId: 'p1', quantity: 2, product: { price: 10 } },
      { productId: 'p2', quantity: 1, product: { price: 3.5 } }
    ] });
    const { result } = renderHook(() => ({ auth: useAuth(), cart: useCart() }), { wrapper: appWrapper });
    await act(async () => { await result.current.auth.login({ email: 'user@example.test', password: 'password' }); });
    await waitFor(() => expect(result.current.cart.status).toBe('ready'));
    expect(result.current.cart.itemCount).toBe(3);
    expect(result.current.cart.total).toBe(23.5);
  });

  it('represents an empty server cart and cart request errors', async () => {
    login.mockResolvedValue(success());
    getCart.mockResolvedValueOnce({ items: [] });
    const { result } = renderHook(() => ({ auth: useAuth(), cart: useCart() }), { wrapper: appWrapper });
    await act(async () => { await result.current.auth.login({ email: 'user@example.test', password: 'password' }); });
    await waitFor(() => expect(result.current.cart.status).toBe('empty'));
    getCart.mockRejectedValueOnce(new Error('Network unavailable'));
    await act(async () => { await result.current.cart.refresh(); });
    expect(result.current.cart.status).toBe('error');
    expect(result.current.cart.error.message).toBe('Network unavailable');
  });

  it('marks an unconfirmed cart mutation and requires a read refresh before another change', async () => {
    login.mockResolvedValue(success());
    const persistedCart = { items: [{ productId: 'p-1', quantity: 1, product: { price: 12 } }] };
    getCart.mockResolvedValueOnce({ items: [] })
      .mockRejectedValueOnce(Object.assign(new Error('Network unavailable'), { kind: 'network' }))
      .mockResolvedValueOnce(persistedCart);
    addCartItem.mockResolvedValue({});
    const { result } = renderHook(() => ({ auth: useAuth(), cart: useCart() }), { wrapper: appWrapper });
    await act(async () => { await result.current.auth.login({ email: 'user@example.test', password: 'password' }); });
    await waitFor(() => expect(getCart).toHaveBeenCalledTimes(1));

    let outcome;
    await act(async () => { outcome = await result.current.cart.addItem('p-1', 1); });
    expect(outcome).toMatchObject({ ok: false, uncertain: true });
    expect(outcome.error.message).toMatch(/could not be confirmed/i);
    expect(addCartItem).toHaveBeenCalledTimes(1);

    let blockedOutcome;
    await act(async () => { blockedOutcome = await result.current.cart.addItem('p-1', 1); });
    expect(blockedOutcome).toMatchObject({ ok: false, uncertain: true });
    expect(addCartItem).toHaveBeenCalledTimes(1);

    let refreshed;
    await act(async () => { refreshed = await result.current.cart.refresh(); });
    expect(refreshed).toEqual(persistedCart);
    expect(addCartItem).toHaveBeenCalledTimes(1);
    expect(result.current.cart.mutationError).toBeNull();
    expect(result.current.cart.itemCount).toBe(1);
  });

  it('clears cart state at logout and ignores an older in-flight response', async () => {
    login.mockResolvedValue(success());
    let resolveCart;
    getCart.mockReturnValue(new Promise((resolve) => { resolveCart = resolve; }));
    const { result } = renderHook(() => ({ auth: useAuth(), cart: useCart() }), { wrapper: appWrapper });
    await act(async () => { await result.current.auth.login({ email: 'user@example.test', password: 'password' }); });
    await waitFor(() => expect(getCart).toHaveBeenCalled());
    act(() => result.current.auth.logout());
    await act(async () => { resolveCart({ items: [{ productId: 'old', quantity: 1, product: { price: 999 } }] }); });
    expect(result.current.cart.status).toBe('idle');
    expect(result.current.cart.itemCount).toBe(0);
    expect(result.current.cart.total).toBe(0);
  });

  it('throws a clear error when the hook is outside its provider', () => {
    expect(() => renderHook(() => useCart())).toThrow('useCart must be used within a CartProvider.');
  });
});

describe('application integration', () => {
  it('keeps the existing landing and not-found routes available without API access', () => {
    const { unmount } = render(<App />, { wrapper: ({ children }) => (
      <AuthProvider><CartProvider><MemoryRouter initialEntries={['/']}>{children}</MemoryRouter></CartProvider></AuthProvider>
    ) });
    expect(screen.getByRole('heading', { name: /Everyday,\s*reconsidered/i })).toBeTruthy();
    unmount();
    render(<App />, { wrapper: ({ children }) => (
      <AuthProvider><CartProvider><MemoryRouter initialEntries={['/missing-stage-b-route']}>{children}</MemoryRouter></CartProvider></AuthProvider>
    ) });
    expect(screen.getByRole('heading', { name: /This page is\s*still on its way/i })).toBeTruthy();
    expect(getCart).not.toHaveBeenCalled();
  });
});
