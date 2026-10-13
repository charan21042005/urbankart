import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import App from '../App.jsx';
import { AuthProvider } from '../auth/AuthContext.jsx';
import { CartProvider } from '../cart/CartContext.jsx';
import { clearAccessToken } from '../api/tokenStore.js';
import { getProduct, getProducts } from '../api/productApi.js';
import { addCartItem, clearCart, getCart, removeCartItem, setCartItemQuantity } from '../api/cartApi.js';
import { login, register } from '../api/authApi.js';

vi.mock('../api/productApi.js', () => ({ getProduct: vi.fn(), getProducts: vi.fn() }));
vi.mock('../api/authApi.js', () => ({ login: vi.fn(), register: vi.fn() }));
vi.mock('../api/cartApi.js', () => ({
  getCart: vi.fn(), addCartItem: vi.fn(), setCartItemQuantity: vi.fn(), removeCartItem: vi.fn(), clearCart: vi.fn()
}));

const product = { _id: 'p-1', name: 'Canvas carryall', description: 'A useful everyday bag.', price: 42.5, stock: 4, category: 'Accessories', attributes: [{ key: 'Material', value: 'Canvas' }] };
const pages = (entries = ['/']) => ({ children }) => (
  <AuthProvider><CartProvider><MemoryRouter initialEntries={entries}>{children}</MemoryRouter></CartProvider></AuthProvider>
);
const renderApp = (entries) => render(<App />, { wrapper: pages(entries) });
const signedIn = () => login.mockResolvedValue({ status: 'success', token: 'opaque-token', user: { id: 'u1', name: 'A Shopper', email: 'shopper@example.test', role: 'customer' } });

beforeEach(() => {
  clearAccessToken();
  getProducts.mockReset(); getProduct.mockReset(); login.mockReset(); register.mockReset();
  getCart.mockReset(); addCartItem.mockReset(); setCartItemQuantity.mockReset(); removeCartItem.mockReset(); clearCart.mockReset();
  getCart.mockResolvedValue({ items: [] });
  getProducts.mockResolvedValue({ products: [product], pagination: { totalCount: 1, page: 1, pageSize: 20, totalPages: 1 } });
  getProduct.mockResolvedValue(product);
});

describe('Stage C catalogue and detail', () => {
  it('renders catalogue products from the API response without a fabricated currency', async () => {
    renderApp();
    expect(await screen.findByRole('heading', { name: 'Canvas carryall' })).toBeTruthy();
    expect(screen.getByText('42.50')).toBeTruthy();
    expect(screen.getByLabelText('Search products')).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Category' })).toBeTruthy();
  });

  it('renders the empty and recoverable catalogue error states', async () => {
    getProducts.mockResolvedValueOnce({ products: [], pagination: { totalCount: 0, page: 1, pageSize: 20, totalPages: 0 } });
    renderApp();
    expect(await screen.findByText('The collection is being prepared.')).toBeTruthy();
    cleanup();
    getProducts.mockRejectedValueOnce(new Error('Service offline'));
    renderApp();
    expect(await screen.findByRole('heading', { name: /couldn.t reach the collection/i })).toBeTruthy();
    expect(screen.getByText('Service offline')).toBeTruthy();
  });

  it('debounces search and sends supported query parameters, then filters category', async () => {
    renderApp();
    await screen.findByRole('heading', { name: 'Canvas carryall' });
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search products' }), { target: { value: 'canvas' } });
    await waitFor(() => expect(getProducts).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'canvas', page: 1 })), { timeout: 1500 });
    await screen.findByRole('option', { name: 'Accessories' });
    fireEvent.change(screen.getByRole('combobox', { name: 'Category' }), { target: { value: 'Accessories' } });
    await waitFor(() => expect(getProducts).toHaveBeenLastCalledWith(expect.objectContaining({ category: 'Accessories', page: 1 })));
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(getProducts).toHaveBeenLastCalledWith(expect.objectContaining({ search: '', category: '' })));
  });

  it('aborts a stale catalogue request when the search changes', async () => {
    let resolveStale;
    getProducts.mockImplementationOnce(({ signal }) => new Promise((resolve) => {
      resolveStale = () => resolve({ products: [{ ...product, _id: 'old', name: 'Old result' }], pagination: { totalCount: 1, page: 1, pageSize: 20, totalPages: 1 } });
      signal.addEventListener('abort', () => {});
    }));
    renderApp();
    await waitFor(() => expect(getProducts).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search products' }), { target: { value: 'canvas' } });
    await waitFor(() => expect(getProducts).toHaveBeenCalledTimes(2), { timeout: 1500 });
    expect(getProducts.mock.calls[0][0].signal.aborted).toBe(true);
    expect(await screen.findByRole('heading', { name: 'Canvas carryall' })).toBeTruthy();
    resolveStale();
    expect(screen.queryByRole('heading', { name: 'Old result' })).toBeNull();
  });

  it('uses server pagination headers to move to the next page', async () => {
    getProducts.mockResolvedValue({ products: [product], pagination: { totalCount: 41, page: 1, pageSize: 20, totalPages: 3 } });
    renderApp();
    expect(await screen.findByText('Page 1 of 3')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(getProducts).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })));
  });

  it('distinguishes product not-found from a recoverable detail error', async () => {
    getProduct.mockRejectedValueOnce(Object.assign(new Error('Not found'), { status: 404 }));
    renderApp(['/products/missing']);
    expect(await screen.findByText('We couldn’t find that item.')).toBeTruthy();
    getProduct.mockRejectedValueOnce(new Error('Connection failed'));
    renderApp(['/products/p-1']);
    expect(await screen.findByText('We couldn’t load this item.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Canvas carryall' })).toBeTruthy();
  });

  it('shows detail attributes and requires sign-in before cart mutation', async () => {
    renderApp(['/products/p-1']);
    expect(await screen.findByRole('heading', { name: 'Canvas carryall' })).toBeTruthy();
    expect(screen.getByText('Material')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Sign in to add to cart' })).toBeTruthy();
    expect(addCartItem).not.toHaveBeenCalled();
  });

  it('returns from sign-in to the product and confirms cart add only after API success', async () => {
    signedIn();
    addCartItem.mockResolvedValue({});
    renderApp(['/products/p-1']);
    fireEvent.click(await screen.findByRole('link', { name: 'Sign in to add to cart' }));
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'shopper@example.test' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct-horse' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('button', { name: 'Add to cart' })).toBeTruthy();
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Quantity' }), { target: { value: '2.9' } });
    expect(screen.getByRole('spinbutton', { name: 'Quantity' }).value).toBe('2');
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Quantity' }), { target: { value: '99' } });
    expect(screen.getByRole('spinbutton', { name: 'Quantity' }).value).toBe('4');
    fireEvent.click(screen.getByRole('button', { name: 'Add to cart' }));
    await waitFor(() => expect(addCartItem).toHaveBeenCalledWith('p-1', 4));
    expect(await screen.findByText('Canvas carryall was added to your cart.')).toBeTruthy();
    addCartItem.mockRejectedValueOnce(new Error('Requested quantity is not currently available.'));
    fireEvent.click(screen.getByRole('button', { name: 'Add to cart' }));
    expect(await screen.findByText('Requested quantity is not currently available.')).toBeTruthy();
  });

  it('requires a read-only cart refresh after an uncertain add instead of replaying it', async () => {
    signedIn();
    addCartItem.mockRejectedValueOnce(Object.assign(new Error('Network unavailable'), { kind: 'network' }));
    renderApp(['/products/p-1']);
    fireEvent.click(await screen.findByRole('link', { name: 'Sign in to add to cart' }));
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'shopper@example.test' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct-horse' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Add to cart' }));
    expect(await screen.findByText(/cart change could not be confirmed/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh cart' }));
    await waitFor(() => expect(getCart).toHaveBeenCalledTimes(2));
    expect(addCartItem).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/cart has been refreshed/i)).toBeTruthy();
  });

  it('blocks cart edits after an uncertain update until a refresh succeeds', async () => {
    signedIn();
    getCart.mockResolvedValue({ items: [{ productId: 'p-1', quantity: 1, product }] });
    setCartItemQuantity.mockRejectedValueOnce(Object.assign(new Error('Network unavailable'), { kind: 'network' }));
    renderApp(['/cart']);
    fireEvent.click(within(screen.getByRole('main')).getByRole('link', { name: 'Sign in' }));
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'shopper@example.test' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct-horse' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByText('Estimated subtotal');

    fireEvent.click(screen.getByRole('button', { name: 'Increase Canvas carryall quantity' }));
    expect(await screen.findByText(/cart change could not be confirmed/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Increase Canvas carryall quantity' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Remove' }).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh cart' }));
    await waitFor(() => expect(getCart).toHaveBeenCalledTimes(2));
    expect(setCartItemQuantity).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Increase Canvas carryall quantity' }).disabled).toBe(false);
  });

  it('validates login fields and authenticates through the shared provider', async () => {
    const { container } = renderApp(['/login']);
    const form = container.querySelector('form');
    fireEvent.submit(form);
    expect(await screen.findByText('Enter a valid email address.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'shopper@example.test' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'short' } });
    fireEvent.submit(form);
    expect(await screen.findByText('Password must be between 8 and 72 UTF-8 bytes.')).toBeTruthy();
    signedIn();
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct-horse' } });
    fireEvent.submit(form);
    expect(await screen.findByRole('button', { name: 'Sign out' })).toBeTruthy();
    expect(login).toHaveBeenCalledWith({ email: 'shopper@example.test', password: 'correct-horse' });
  });

  it('validates registration and sends only the documented fields', async () => {
    const { container } = renderApp(['/register']);
    const form = container.querySelector('form');
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'bad' } });
    fireEvent.submit(form);
    expect(await screen.findByText('Enter a valid email address.')).toBeTruthy();
    register.mockResolvedValue({ status: 'success', token: 'opaque', user: { id: 'u2', name: 'New Shopper', email: 'new@example.test', role: 'customer' } });
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'New Shopper' } });
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'new@example.test' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'long-enough' } });
    fireEvent.submit(form);
    await waitFor(() => expect(register).toHaveBeenCalledWith({ name: 'New Shopper', email: 'new@example.test', password: 'long-enough' }));
    expect(await screen.findByRole('button', { name: 'Sign out' })).toBeTruthy();
  });
});

describe('Stage C cart', () => {
  it('shows sign-in guidance and makes no cart request for guests', async () => {
    renderApp(['/cart']);
    expect(await screen.findByRole('heading', { name: 'Your cart is waiting.' })).toBeTruthy();
    expect(getCart).not.toHaveBeenCalled();
  });

  it('shows an empty cart and browse action for an authenticated customer', async () => {
    signedIn();
    renderApp(['/cart']);
    fireEvent.click(within(screen.getByRole('main')).getByRole('link', { name: 'Sign in' }));
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'shopper@example.test' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct-horse' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(getCart).toHaveBeenCalled());
    expect(await screen.findByRole('heading', { name: 'Your cart is empty.' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Browse the collection' })).toBeTruthy();
  });

  it('updates and removes cart items using the verified mutation endpoints', async () => {
    signedIn();
    getCart.mockResolvedValue({ items: [{ productId: 'p-1', quantity: 2, product }] });
    renderApp(['/cart']);
    fireEvent.click(within(screen.getByRole('main')).getByRole('link', { name: 'Sign in' }));
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'shopper@example.test' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct-horse' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByText('Estimated subtotal');
    setCartItemQuantity.mockResolvedValue({});
    fireEvent.click(screen.getByRole('button', { name: 'Increase Canvas carryall quantity' }));
    await waitFor(() => expect(setCartItemQuantity).toHaveBeenCalledWith('p-1', 3));
    removeCartItem.mockResolvedValue({});
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(removeCartItem).toHaveBeenCalledWith('p-1'));
    expect(addCartItem).not.toHaveBeenCalled();
    expect(clearCart).not.toHaveBeenCalled();
  });
});
