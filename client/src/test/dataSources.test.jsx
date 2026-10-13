import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router';
import SiteFooter from '../components/layout/SiteFooter.jsx';

describe('storefront data source disclosure', () => {
  it('credits the dataset and links its source and declared licence', () => {
    render(<MemoryRouter><SiteFooter /></MemoryRouter>);
    expect(screen.getByText('About & data sources')).toBeTruthy();
    expect(screen.getByRole('link', { name: /PromptCloud.*Flipkart Products.*Kaggle/ }).getAttribute('href'))
      .toBe('https://www.kaggle.com/datasets/PromptCloudHQ/flipkart-products');
    expect(screen.getByRole('link', { name: 'CC BY-SA 4.0' }).getAttribute('href'))
      .toBe('https://creativecommons.org/licenses/by-sa/4.0/');
    expect(screen.getByText(/Retailer descriptions, trademarks, and linked image assets may have separate rights/)).toBeTruthy();
  });
});
