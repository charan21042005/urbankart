import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import ProductCard from '../components/catalog/ProductCard.jsx';

const mocks = vi.hoisted(() => ({ auth: { isAuthenticated: false }, cart: { isMutating: false, mutationError: null, addItem: vi.fn() } }));
vi.mock('../auth/AuthContext.jsx', () => ({ useAuth: () => mocks.auth }));
vi.mock('../cart/CartContext.jsx', () => ({ useCart: () => mocks.cart }));

const product = { _id: 'product-1', name: 'Studio lamp', category: 'Home decor', price: 45, stock: 3 };
function mount(item = product) { return render(<MemoryRouter><ProductCard product={item} /></MemoryRouter>); }

beforeEach(() => {
  mocks.auth = { isAuthenticated: false };
  mocks.cart = { isMutating: false, mutationError: null, addItem: vi.fn().mockResolvedValue({ ok: true }) };
});

describe('product card actions', () => {
  it('offers guests a sign-in path and labels its category-aware illustration', () => {
    mount();
    expect(screen.getByRole('link', { name: 'Sign in to add' }).getAttribute('href')).toBe('/login');
    expect(screen.getByRole('img', { name: 'Home decor illustration for Studio lamp' })).toBeTruthy();
  });

  it('adds an available product to the signed-in customer cart with feedback', async () => {
    mocks.auth = { isAuthenticated: true };
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Add to cart' }));
    await waitFor(() => expect(mocks.cart.addItem).toHaveBeenCalledWith('product-1', 1));
    expect((await screen.findByRole('status')).textContent).toBe('Added to cart');
  });

  it('does not offer an add action when inventory is unavailable', () => {
    mocks.auth = { isAuthenticated: true };
    mount({ ...product, stock: 0 });
    expect(screen.getByRole('button', { name: 'Unavailable' }).disabled).toBe(true);
  });
});
