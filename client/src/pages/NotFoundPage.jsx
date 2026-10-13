import PageContainer from '../components/layout/PageContainer.jsx';
import { Link } from 'react-router';
import { useEffect } from 'react';

export default function NotFoundPage() {
  // Make the browser title identify the not-found route.
  useEffect(() => { document.title = 'Page not found | UrbanKart'; }, []);
  return (
    <PageContainer className="not-found-page">
      <p className="eyebrow"><span className="eyebrow__rule" /> PAGE NOT FOUND</p>
      <h1>This page is<br /><em>still on its way.</em></h1>
      <Link className="button button--dark" to="/">Return to the beginning <span aria-hidden="true">↗</span></Link>
    </PageContainer>
  );
}
