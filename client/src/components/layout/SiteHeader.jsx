import BrandMark from './BrandMark.jsx';
import PageContainer from './PageContainer.jsx';

export default function SiteHeader() {
  return (
    <header className="site-header">
      <PageContainer className="site-header__inner">
        <BrandMark />
        <nav className="primary-nav" aria-label="Main navigation">
          <a href="/#point-of-view">Our point of view</a>
          <a href="/#next-chapter">What comes next</a>
        </nav>
        <span className="header-note">
          <span className="status-dot" aria-hidden="true" />
          <span>Foundation preview</span>
        </span>
      </PageContainer>
    </header>
  );
}
