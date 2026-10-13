import { Route, Routes } from 'react-router';
import SiteFooter from './components/layout/SiteFooter.jsx';
import SiteHeader from './components/layout/SiteHeader.jsx';
import StorefrontPage from './pages/StorefrontPage.jsx';
import ProductDetailPage from './pages/ProductDetailPage.jsx';
import CartPage from './pages/CartPage.jsx';
import AuthPage from './pages/AuthPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';
import CheckoutPage from './pages/CheckoutPage.jsx';

export default function App() {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <SiteHeader />
      <main id="main-content" className="main-content">
        <Routes>
          <Route path="/" element={<StorefrontPage />} />
          <Route path="/products/:id" element={<ProductDetailPage />} />
          <Route path="/cart" element={<CartPage />} />
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/register" element={<AuthPage mode="register" />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
      <SiteFooter />
    </div>
  );
}
