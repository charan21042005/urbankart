import BrandMark from './BrandMark.jsx';
import PageContainer from './PageContainer.jsx';
import { Link, NavLink } from 'react-router';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useCart } from '../../cart/CartContext.jsx';

export default function SiteHeader() {
  const auth = useAuth();
  const cart = useCart();
  return (
    <header className="site-header">
      <PageContainer className="site-header__inner">
        <BrandMark />
        <nav className="primary-nav" aria-label="Main navigation">
          <NavLink to="/" end>Shop</NavLink>
          <NavLink to="/cart" className="cart-nav">Cart <span aria-label={`${cart.itemCount} items`}>{cart.itemCount}</span></NavLink>
          {auth.isAuthenticated && auth.user?.role === 'admin' && <NavLink to="/admin">Admin Dashboard</NavLink>}
        </nav>
        <div className="header-actions">{auth.isAuthenticated ? <><span className="header-user">{auth.user.name}</span><button type="button" className="header-action" onClick={auth.logout}>Sign out</button></> : <><Link className="header-action" to="/login">Sign in</Link><Link className="header-action header-action--join" to="/register">Join</Link></>}</div>
      </PageContainer>
    </header>
  );
}
