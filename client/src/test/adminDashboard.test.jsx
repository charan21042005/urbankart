import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import AdminDashboard from '../pages/AdminDashboard.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { getAdminDashboard } from '../api/adminApi.js';

vi.mock('../auth/AuthContext.jsx', () => ({ useAuth: vi.fn() }));
vi.mock('../api/adminApi.js', () => ({ getAdminDashboard: vi.fn() }));

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
});

describe('AdminDashboard', () => {
  it('renders API-derived revenue, product and status charts for administrators', async () => {
    renderDashboard();
    expect(await screen.findByRole('heading', { name: 'Admin analytics' })).toBeTruthy();
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
    render(<AdminDashboard />);
    expect(screen.getByRole('status').textContent).toContain('Loading analytics');
    finish({ ...sample, hasOrders: false, revenueByCategory: [], topProducts: [], orderStatusBreakdown: [] });
    expect(await screen.findByText('No orders to summarize yet.')).toBeTruthy();
  });

  it('shows the empty state when there are no orders', async () => {
    getAdminDashboard.mockResolvedValue({ ...sample, hasOrders: false, revenueByCategory: [], topProducts: [], orderStatusBreakdown: [] });
    renderDashboard();
    expect(await screen.findByText('No orders to summarize yet.')).toBeTruthy();
    expect(screen.queryByTestId('revenue-chart')).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Refresh analytics' })).toHaveLength(2);
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
    expect(await screen.findByRole('alert')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry dashboard' }));
    expect(await screen.findByTestId('revenue-chart')).toBeTruthy();
    await waitFor(() => expect(getAdminDashboard).toHaveBeenCalledTimes(2));
  });
});
