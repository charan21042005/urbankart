import BrandMark from './BrandMark.jsx';
import PageContainer from './PageContainer.jsx';

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <PageContainer className="site-footer__inner">
        <BrandMark />
        <p>Thoughtfully built for everyday discovery.</p>
        <details className="site-footer__sources">
          <summary>About &amp; data sources</summary>
          <div className="site-footer__sources-panel">
            <p>
              Product catalogue source: <a href="https://www.kaggle.com/datasets/PromptCloudHQ/flipkart-products" target="_blank" rel="noreferrer">PromptCloud, “Flipkart Products” on Kaggle</a>, declared by the dataset page under <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">CC BY-SA 4.0</a>.
            </p>
            <p>UrbanKart filters invalid prices and duplicate records, normalizes categories and specifications, and maps selected fields into its product catalogue. The source has no inventory field: the importer defaults stock to 0, while this local academic demo assigns 10 synthetic units to imported records for checkout testing. These quantities are not retailer inventory. Product illustrations are original category-aware artwork, not source product photos.</p>
            <p>The declaration applies only to material the uploader had authority to license. Retailer descriptions, trademarks, and linked image assets may have separate rights; UrbanKart does not display or redistribute the source image URLs.</p>
          </div>
        </details>
        <a href="#main-content" className="back-to-top">Back to top <span aria-hidden="true">↑</span></a>
      </PageContainer>
    </footer>
  );
}
