import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import AdminDashboard from '../pages/AdminDashboard.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { getAdminDashboard, getAdminOverview, getAdminUsers, getAdminOrders, getAdminReviews, getAdminProducts } from '../api/adminApi.js';

vi.mock('../auth/AuthContext.jsx', () => ({ useAuth: vi.fn() }));
vi.mock('../api/adminApi.js', () => ({
  getAdminDashboard: vi.fn(), getAdminOverview: vi.fn(), getAdminUsers: vi.fn(), getAdminUser: vi.fn(), getAdminUserCart: vi.fn(),
  getAdminOrders: vi.fn(), getAdminOrder: vi.fn(), getAdminReviews: vi.fn(), getAdminProducts: vi.fn(),
  createAdminProduct: vi.fn(), updateAdminProduct: vi.fn(), deleteAdminProduct: vi.fn()
}));

const sample = {
  status: 'success', hasOrders: true, generatedAt: '2026-10-14T00:00:00.000Z',
  revenueByCategory: [{ category: 'Electronics', revenue: 152.5 }],
  topProducts: [{ productId: 'product-1', name: 'Wireless keyboard', unitsSold: 4 }],
  orderStatusBreakdown: [{ status: 'pending', count: 1 }, { status: 'delivered', count: 3 }]
};
const renderDashboard = () => render(<MemoryRouter><AdminDashboard /></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  useAuth.mockReturnValue({ isAuthenticated: true, user: { role: 'admin' } });
  getAdminDashboard.mockResolvedValue(sample);
  getAdminOverview.mockResolvedValue({ productCount: 6, categoryCounts: [], activeUserCount: 0, orderCount: 0, reviewCount: 0, averageReviewRating: null, activeCartCount: 0, cartItemCount: 0, orderStatusBreakdown: [] });
  getAdminUsers.mockResolvedValue({ users: [], total: 0, totalPages: 0 });
  getAdminOrders.mockResolvedValue({ orders: [], total: 0, totalPages: 0 });
  getAdminReviews.mockResolvedValue({ reviews: [], total: 0, totalPages: 0 });
  getAdminProducts.mockResolvedValue({ products: [], pagination: { totalCount: 0, page: 1, pageSize: 20, totalPages: 0 } });
});

const openAnalytics = () => fireEvent.click(screen.getByRole('link', { name: 'Analytics' }));

describe('AdminDashboard', () => {
  it('opens each management section at its own route and loads that section data', async () => {
    renderDashboard();
    expect(await screen.findByRole('heading', { name: 'Admin Dashboard' })).toBeTruthy();

    fireEvent.click(screen.getByRole('link', { name: 'Products' }));
    expect(await screen.findByRole('heading', { name: 'Products' })).toBeTruthy();
    expect(await screen.findByRole('heading', { name: 'Create catalogue product' })).toBeTruthy();
    expect(getAdminProducts).toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Products' }).getAttribute('aria-current')).toBe('page');

    fireEvent.click(screen.getByRole('link', { name: 'Users & carts' }));
    expect(await screen.findByRole('heading', { name: 'Users & carts' })).toBeTruthy();
    expect(await screen.findByRole('heading', { name: 'No matching customers' })).toBeTruthy();
    expect(getAdminUsers).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('link', { name: 'Orders' }));
    expect(await screen.findByRole('heading', { name: 'No orders yet' })).toBeTruthy();
    expect(getAdminOrders).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('link', { name: 'Reviews' }));
    expect(await screen.findByRole('heading', { name: 'No reviews yet' })).toBeTruthy();
    expect(getAdminReviews).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('link', { name: 'Analytics' }));
    expect(await screen.findByTestId('revenue-chart')).toBeTruthy();
    expect(getAdminDashboard).toHaveBeenCalled();
  });

  it('renders API-derived revenue, product and status charts for administrators', async () => {
    renderDashboard();
    expect(await screen.findByRole('heading', { name: 'Admin Dashboard' })).toBeTruthy();
    await openAnalytics();
    expect(await screen.findByTestId('revenue-chart')).toBeTruthy();
    expect(screen.getByTestId('top-products-chart')).toBeTruthy();
    expect(screen.getByTestId('order-status-chart')).toBeTruthy();
    expect(screen.getByText('Revenue by category')).toBeTruthy();
    expect(screen.getByText('Top five products')).toBeTruthy();
    expect(screen.getByText('Order status')).toBeTruthy();
    expect(getAdminDashboard).toHaveBeenCalledTimes(1);
  });

  it('shows a useful loading state before analytics are returned', async () => {
    let finish;
    getAdminDashboard.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    render(<MemoryRouter><AdminDashboard /></MemoryRouter>);
    await openAnalytics();
    expect(screen.getByText(/Loading analytics/)).toBeTruthy();
    finish({ ...sample, hasOrders: false, revenueByCategory: [], topProducts: [], orderStatusBreakdown: [] });
    expect(await screen.findByText('No orders to summarize yet.')).toBeTruthy();
  });

  it('shows the empty state when there are no orders', async () => {
    getAdminDashboard.mockResolvedValue({ ...sample, hasOrders: false, revenueByCategory: [], topProducts: [], orderStatusBreakdown: [] });
    renderDashboard();
    await openAnalytics();
    expect(await screen.findByText('No orders to summarize yet.')).toBeTruthy();
    expect(screen.queryByTestId('revenue-chart')).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Refresh analytics' })).toHaveLength(1);
  });

  it('does not fetch for a customer and renders the restricted state', () => {
    useAuth.mockReturnValue({ isAuthenticated: true, user: { role: 'customer' } });
    renderDashboard();
    expect(screen.getByRole('heading', { name: 'Administrator access required.' })).toBeTruthy();
    expect(getAdminDashboard).not.toHaveBeenCalled();
  });

  it('shows an API error and retries to render fresh values', async () => {
    getAdminDashboard.mockRejectedValueOnce(new Error('The analytics service is temporarily unavailable.'))
      .mockResolvedValueOnce(sample);
    renderDashboard();
    await openAnalytics();
    expect(await screen.findByRole('alert')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry analytics' }));
    expect(await screen.findByTestId('revenue-chart')).toBeTruthy();
    await waitFor(() => expect(getAdminDashboard).toHaveBeenCalledTimes(2));
  });
});
