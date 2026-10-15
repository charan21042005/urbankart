import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis
} from 'recharts';
import PageContainer from '../components/layout/PageContainer.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { getAdminDashboard } from '../api/adminApi.js';
import AdminWorkspace from '../components/admin/AdminWorkspace.jsx';

const STATUS_COLORS = ['#b64c35', '#586044', '#d4a13c', '#698783', '#8c8271', '#665479'];
const numberFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
const wholeNumberFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

function MetricPanel({ title, id, children }) {
  return <section className="dashboard-panel" aria-labelledby={id}>
    <div className="dashboard-panel__heading"><h2 id={id}>{title}</h2>{children}</div>
  </section>;
}

function DashboardCharts({ data }) {
  const revenue = data.revenueByCategory.filter((item) => typeof item.category === 'string' && Number.isFinite(item.revenue));
  const products = data.topProducts.filter((item) => typeof item.name === 'string' && Number.isFinite(item.unitsSold));
  const statuses = data.orderStatusBreakdown.filter((item) => typeof item.status === 'string' && Number.isFinite(item.count));

  return <div className="dashboard-grid">
    <MetricPanel title="Revenue by category" id="revenue-heading">
      <p className="dashboard-panel__note">Completed, shipped and delivered items · currency unspecified</p>
      {revenue.length ? <div className="dashboard-chart" role="img" aria-label="Bar chart showing revenue by current product category" data-testid="revenue-chart">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={revenue} layout="vertical" margin={{ top: 8, right: 22, bottom: 8, left: 12 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" tickFormatter={(value) => numberFormat.format(value)} />
            <YAxis type="category" dataKey="category" width={120} />
            <Tooltip formatter={(value) => [numberFormat.format(value), 'Revenue']} />
            <Bar dataKey="revenue" name="Revenue" fill="#b64c35" radius={[0, 3, 3, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div> : <p className="dashboard-chart__empty" role="status">No recognized sales to chart.</p>}
    </MetricPanel>

    <MetricPanel title="Top five products" id="top-products-heading">
      <p className="dashboard-panel__note">Units sold from non-cancelled sales</p>
      {products.length ? <div className="dashboard-chart" role="img" aria-label="Bar chart showing the five best-selling products by units" data-testid="top-products-chart">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={products} layout="vertical" margin={{ top: 8, right: 22, bottom: 8, left: 12 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" allowDecimals={false} tickFormatter={(value) => wholeNumberFormat.format(value)} />
            <YAxis type="category" dataKey="name" width={150} />
            <Tooltip formatter={(value) => [wholeNumberFormat.format(value), 'Units sold']} />
            <Bar dataKey="unitsSold" name="Units sold" fill="#586044" radius={[0, 3, 3, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div> : <p className="dashboard-chart__empty" role="status">No product units have been recorded yet.</p>}
    </MetricPanel>

    <MetricPanel title="Order status" id="order-status-heading">
      <p className="dashboard-panel__note">All statuses, including pending and cancelled</p>
      {statuses.length ? <div className="dashboard-chart dashboard-chart--pie" role="img" aria-label="Pie chart showing counts for all order statuses" data-testid="order-status-chart">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={statuses} dataKey="count" nameKey="status" cx="50%" cy="48%" outerRadius="66%" label={({ status, percent }) => `${status} ${Math.round(percent * 100)}%`}>
              {statuses.map((entry, index) => <Cell key={entry.status} fill={STATUS_COLORS[index % STATUS_COLORS.length]} />)}
            </Pie>
            <Tooltip formatter={(value) => [wholeNumberFormat.format(value), 'Orders']} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div> : <p className="dashboard-chart__empty" role="status">No orders are recorded yet.</p>}
    </MetricPanel>
  </div>;
}

export default function AdminDashboard() {
  const auth = useAuth();
  const isAdmin = auth.isAuthenticated && auth.user?.role === 'admin';
  const [attempt, setAttempt] = useState(0);
  const [section, setSection] = useState('Overview');
  const [state, setState] = useState({ status: 'loading', data: null, error: null });

  useEffect(() => {
    if (!isAdmin) return undefined;
    const controller = new AbortController();
    setState({ status: 'loading', data: null, error: null });
    getAdminDashboard({ signal: controller.signal }).then((data) => {
      if (!controller.signal.aborted) setState({ status: 'ready', data, error: null });
    }).catch((error) => {
      if (!controller.signal.aborted) setState({ status: 'error', data: null, error });
    });
    return () => controller.abort();
  }, [isAdmin, attempt]);

  useEffect(() => { document.title = 'Admin analytics | UrbanKart'; }, []);

  const hasOrders = useMemo(() => Boolean(state.data?.hasOrders
    ?? state.data?.orderStatusBreakdown?.some((item) => item.count > 0)), [state.data]);

  if (!auth.isAuthenticated) return <PageContainer className="admin-page">
    <p className="eyebrow">UrbanKart administration</p><h1>Sign in to continue.</h1>
    <p>Dashboard access is available to administrator accounts.</p>
    <Link className="button button--dark" to="/login" state={{ from: '/admin' }}>Sign in</Link>
  </PageContainer>;

  if (!isAdmin) return <PageContainer className="admin-page" role="status">
    <p className="eyebrow">UrbanKart administration</p><h1>Administrator access required.</h1>
    <p>Your account cannot open dashboard analytics.</p><Link className="button" to="/">Return to the collection</Link>
  </PageContainer>;

  const analytics = <>
    {state.status === 'loading' && <div className="dashboard-message" role="status" aria-busy="true"><h2>Loading analytics…</h2><p>Summarizing order records in MongoDB.</p></div>}
    {state.status === 'error' && <div className="dashboard-message" role="alert"><h2>Analytics could not be loaded.</h2><p>{state.error?.message || 'The dashboard service is temporarily unavailable.'}</p><button className="button button--dark" type="button" onClick={() => setAttempt((current) => current + 1)}>Retry analytics</button></div>}
    {state.status === 'ready' && !hasOrders && <div className="dashboard-message" role="status"><h2>No orders to summarize yet.</h2><p>Dashboard charts appear when customers complete checkout. Create a customer account, choose an in-stock item, and place a local demo order.</p><Link className="button" to="/">Open storefront</Link></div>}
    {state.status === 'ready' && hasOrders && <><DashboardCharts data={state.data} /><p className="dashboard-footnote">Revenue uses historical item prices and quantities for completed, shipped and delivered orders. Category names come from current product records; deleted or missing products are Unattributed.</p></>}
  </>;

  return <PageContainer className="admin-page">
    <div className="catalog-heading admin-page__heading">
      <div><p className="eyebrow"><span className="eyebrow__rule" /> Store management</p><h1>Admin Dashboard</h1></div>
      {section === 'Analytics' && state.status === 'ready' && <button className="button" type="button" onClick={() => setAttempt((current) => current + 1)}>Refresh analytics</button>}
    </div>
    <AdminWorkspace section={section} onSectionChange={setSection} analytics={analytics}/>
  </PageContainer>;
}
