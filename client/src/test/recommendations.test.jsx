import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import RecommendationSection from '../components/catalog/RecommendationSection.jsx';
import { getRecommendations } from '../api/productApi.js';

vi.mock('../api/productApi.js', () => ({ getRecommendations: vi.fn() }));
vi.mock('../components/catalog/ProductCard.jsx', () => ({ default: ({ product }) => <article><h3>{product.name}</h3></article> }));

const wrapper = ({ children }) => <MemoryRouter>{children}</MemoryRouter>;
const engineResult = {
  source: 'recommendation-engine',
  items: [{
    product: { _id: 'product-2', name: 'Wireless mouse' },
    score: 0.6,
    explanation: { sharedTags: ['wireless'], sharedAttributes: [{ key: 'connection', value: 'Bluetooth' }], categoryMatch: true }
  }]
};

beforeEach(() => {
  vi.clearAllMocks();
  getRecommendations.mockResolvedValue(engineResult);
});

describe('RecommendationSection', () => {
  it('loads real recommendations and exposes their score and shared-feature explanation', async () => {
    render(<RecommendationSection productId="product-1" />, { wrapper });
    expect(await screen.findByRole('heading', { name: 'You might also like' })).toBeTruthy();
    expect(await screen.findByRole('heading', { name: 'Wireless mouse' })).toBeTruthy();
    expect(screen.getByText(/Similarity 60%/)).toBeTruthy();
    expect(screen.getByText(/Shared tags: wireless/)).toBeTruthy();
    expect(screen.getByText(/connection: Bluetooth/)).toBeTruthy();
  });

  it('labels category fallback results without claiming they are similarity-ranked', async () => {
    getRecommendations.mockResolvedValue({ source: 'fallback', items: [{
      product: { _id: 'product-2', name: 'Popular lamp' }, score: null, explanation: { type: 'same-category-rating-fallback' }
    }] });
    render(<RecommendationSection productId="product-1" />, { wrapper });
    expect(await screen.findByText('Popular in this category')).toBeTruthy();
    expect(screen.getByText('A highly rated pick from the same category.')).toBeTruthy();
    expect(screen.queryByText(/Similarity/)).toBeNull();
  });

  it('renders an empty state when no relevant or fallback products exist', async () => {
    getRecommendations.mockResolvedValue({ source: 'fallback', items: [] });
    render(<RecommendationSection productId="product-1" />, { wrapper });
    expect(await screen.findByText('There are no related products to show yet.')).toBeTruthy();
  });

  it('keeps product detail independent of a recommendation API failure and retries', async () => {
    getRecommendations.mockRejectedValueOnce(new Error('recommendation service unavailable')).mockResolvedValueOnce(engineResult);
    render(<RecommendationSection productId="product-1" />, { wrapper });
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText(/product details above are still available/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry recommendations' }));
    expect(await screen.findByRole('heading', { name: 'Wireless mouse' })).toBeTruthy();
  });
});
