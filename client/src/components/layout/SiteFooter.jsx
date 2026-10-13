import BrandMark from './BrandMark.jsx';
import PageContainer from './PageContainer.jsx';

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <PageContainer className="site-footer__inner">
        <BrandMark />
        <p>Thoughtfully built for everyday discovery.</p>
        <a href="#main-content" className="back-to-top">Back to top <span aria-hidden="true">↑</span></a>
      </PageContainer>
    </footer>
  );
}
