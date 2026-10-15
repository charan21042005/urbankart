import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import AccountPage from '../pages/AccountPage.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { getMyOrders } from '../api/userApi.js';

vi.mock('../auth/AuthContext.jsx', () => ({ useAuth: vi.fn() }));
vi.mock('../api/userApi.js', () => ({ getMyOrders: vi.fn() }));

const auth = { isAuthenticated: true, user: { id: 'customer-1', name: 'Customer One', email: 'customer@example.test', role: 'customer' }, updateProfile: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
  useAuth.mockReturnValue(auth);
  getMyOrders.mockResolvedValue({ orders: [], page: 1, limit: 10, total: 0, totalPages: 0 });
});

const renderPage = () => render(<MemoryRouter><AccountPage /></MemoryRouter>);

describe('customer account page', () => {
  it('shows a sign-in path to guests', () => {
    useAuth.mockReturnValue({ isAuthenticated: false, user: null });
    renderPage();
    expect(screen.getByRole('heading', { name: 'Sign in to see your account.' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Create an account' }).getAttribute('href')).toBe('/register');
    expect(getMyOrders).not.toHaveBeenCalled();
  });

  it('shows profile data, an honest empty order state and can save the profile name', async () => {
    auth.updateProfile.mockResolvedValue({ name: 'Updated Customer' });
    renderPage();
    expect(await screen.findByText(/No orders yet/)).toBeTruthy();
    expect(screen.getByDisplayValue('customer@example.test').readOnly).toBe(true);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Updated Customer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }));
    await waitFor(() => expect(auth.updateProfile).toHaveBeenCalledWith('Updated Customer'));
    expect(await screen.findByText('Your profile name has been updated.')).toBeTruthy();
  });

  it('renders order snapshot details and paginated navigation', async () => {
    getMyOrders.mockResolvedValue({ orders: [{ _id: 'order-1', status: 'pending', orderDate: '2026-10-15T08:00:00.000Z', totalAmount: 25, items: [{ productId: 'p1', nameAtPurchase: 'Demo lamp', qty: 1, priceAtPurchase: 25 }] }], page: 1, limit: 10, total: 11, totalPages: 2 });
    renderPage();
    expect(await screen.findByText('Demo lamp · 1 × 25.00')).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Order history pages' })).toBeTruthy();
  });
});
