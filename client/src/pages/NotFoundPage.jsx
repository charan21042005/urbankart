import PageContainer from '../components/layout/PageContainer.jsx';
import { Link } from 'react-router';

export default function NotFoundPage() {
  return (
    <PageContainer className="not-found-page">
      <p className="eyebrow"><span className="eyebrow__rule" /> PAGE NOT FOUND</p>
      <h1>This page is<br /><em>still on its way.</em></h1>
      <Link className="button button--dark" to="/">Return to the beginning <span aria-hidden="true">↗</span></Link>
    </PageContainer>
  );
}
