import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import PageContainer from '../components/layout/PageContainer.jsx';
import ProductCard from '../components/catalog/ProductCard.jsx';
import { getCategories, getProducts } from '../api/productApi.js';

const PAGE_SIZE = 20;
const readPage = (value) => /^\d+$/.test(value || '') && Number(value) > 0 ? Number(value) : 1;

export default function StorefrontPage() {
  const [params, setParams] = useSearchParams();
  const search = params.get('search') || '';
  const category = params.get('category') || '';
  const sort = params.get('sort') || 'newest';
  const page = readPage(params.get('page'));
  const [draft, setDraft] = useState(search);
  const [state, setState] = useState({ status: 'loading', products: [], pagination: null, error: null });
  const [categories, setCategories] = useState([]);
  const generation = useRef(0);

  // Categories come from the complete catalog endpoint, not only the current page.
  useEffect(() => {
    const controller = new AbortController();
    getCategories({ signal: controller.signal }).then(setCategories).catch(() => {
      if (!controller.signal.aborted) setCategories([]);
    });
    return () => controller.abort();
  }, []);

  // Keep the input draft synchronized when browser navigation changes the URL search.
  useEffect(() => setDraft(search), [search]);

  // Debounce typing into URL state so each search is shareable without a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (draft === search) return;
      const next = new URLSearchParams(params);
      if (draft.trim()) next.set('search', draft.trim()); else next.delete('search');
      next.delete('page');
      setParams(next, { replace: true });
    }, 300);
    return () => clearTimeout(timer);
  }, [draft, search, params, setParams]);

  const load = useCallback(async (signal) => {
    const ownGeneration = ++generation.current;
    setState((current) => ({ ...current, status: 'loading', pagination: null, error: null }));
    try {
      const result = await getProducts({ page, limit: PAGE_SIZE, search, category, sort, signal });
      if (ownGeneration !== generation.current || signal?.aborted) return;
      setState({ status: result.products.length ? 'ready' : 'empty', ...result, error: null });
    } catch (error) {
      if (ownGeneration !== generation.current || signal?.aborted) return;
      setState({ status: 'error', products: [], pagination: null, error });
    }
  }, [page, search, category, sort]);

  // Load the selected API-backed page and discard responses superseded by newer filters.
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => { controller.abort(); generation.current += 1; };
  }, [load]);

  const setFilter = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next);
  };
  const clearFilters = () => { setDraft(''); setParams({}, { replace: true }); };
  const totalPages = state.pagination?.totalPages;
  const canCount = state.pagination?.totalCount !== null && state.pagination?.totalCount !== undefined;

  // Set a route-specific title once the storefront mounts.
  useEffect(() => { document.title = 'Shop | UrbanKart'; }, []);

  return (
    <div className="storefront-page">
      <section className="store-hero">
        <PageContainer className="store-hero__inner">
          <div>
            <p className="eyebrow"><span className="eyebrow__rule" /> The considered edit</p>
            <h1>Everyday,<br /><em>reconsidered.</em></h1>
            <p className="store-hero__intro">Useful things, chosen with care. Explore the UrbanKart collection.</p>
          </div>
          <div className="store-hero__aside" aria-label="UrbanKart collection introduction">
            <span className="store-hero__mark" aria-hidden="true">U</span>
            <span>Objects for<br />real life</span>
            <span className="store-hero__aside-index">COLLECTION / 01</span>
          </div>
        </PageContainer>
      </section>

      <PageContainer className="catalog-section">
        <div className="catalog-heading">
          <div><p className="eyebrow"><span className="eyebrow__rule" /> Discover UrbanKart</p><h2>The collection</h2></div>
          {canCount && <p className="catalog-count">{state.pagination.totalCount.toLocaleString()} items</p>}
        </div>
        <form className="catalog-filters" role="search" onSubmit={(event) => event.preventDefault()}>
          <label className="catalog-search"><span>Search products</span><input type="search" value={draft} maxLength="100" onChange={(event) => setDraft(event.target.value)} placeholder="Name or description" /></label>
          <label className="catalog-category"><span>Category</span><select value={category} onChange={(event) => setFilter('category', event.target.value)}>
            <option value="">All observed categories</option>
            {categories.map((item) => <option value={item} key={item}>{item}</option>)}
          </select></label>
          <label className="catalog-sort"><span>Sort by</span><select value={sort} onChange={(event) => setFilter('sort', event.target.value)}>
            <option value="newest">Newest</option><option value="price-asc">Price: low to high</option>
            <option value="price-desc">Price: high to low</option><option value="name-asc">Name: A to Z</option>
          </select></label>
          {(search || category) && <button className="filter-clear" type="button" onClick={clearFilters}>Clear filters</button>}
        </form>

        {state.status === 'loading' && <div className="product-grid" aria-label="Loading products" aria-busy="true">{Array.from({ length: 8 }, (_, index) => <div className="product-skeleton" key={index}><span /><i /><i /></div>)}</div>}
        {state.status === 'error' && <section className="state-panel" role="alert"><p className="eyebrow">Catalogue unavailable</p><h2>We couldn't reach the collection.</h2><p>{state.error?.message || 'Please check your connection and try again.'}</p><button className="button button--dark" type="button" onClick={() => { const controller = new AbortController(); void load(controller.signal); }}>Try again</button></section>}
        {state.status === 'empty' && <section className="state-panel"><p className="eyebrow">Nothing here yet</p><h2>{search || category ? 'No items match those filters.' : 'The collection is being prepared.'}</h2><p>{search || category ? 'Try another search or clear your filters.' : 'Products will appear here when the catalogue API has records.'}</p>{(search || category) && <button className="button button--dark" type="button" onClick={clearFilters}>Clear filters</button>}</section>}
        {state.status === 'ready' && <>
          <div className="product-grid">{state.products.map((product) => <ProductCard product={product} key={product._id} />)}</div>
          {totalPages > 1 && <nav className="pagination" aria-label="Product pages"><button type="button" disabled={page <= 1} onClick={() => setFilter('page', String(page - 1))}>Previous</button><span>Page {state.pagination.page ?? page} of {totalPages}</span><button type="button" disabled={page >= totalPages} onClick={() => setFilter('page', String(page + 1))}>Next</button></nav>}
        </>}
        <p className="catalog-note">Prices are shown as supplied by the catalogue. The API does not currently specify a currency.</p>
      </PageContainer>
      <section className="store-closing"><PageContainer><p>Thoughtful finds for everyday life.</p><Link to="/cart">Visit your cart <span aria-hidden="true">↗</span></Link></PageContainer></section>
    </div>
  );
}
