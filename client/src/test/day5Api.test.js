import { afterEach, describe, expect, it, vi } from 'vitest';
import { httpClient } from '../api/httpClient.js';
import { getAdminDashboard } from '../api/adminApi.js';
import { getRecommendations } from '../api/productApi.js';

vi.mock('../api/httpClient.js', () => ({ httpClient: { get: vi.fn() } }));

afterEach(() => vi.clearAllMocks());

describe('Day 5 API clients', () => {
  it('requests the source product recommendation route and returns explicit source metadata', async () => {
    httpClient.get.mockResolvedValue({ data: { status: 'success', source: 'fallback', computedAt: null, items: [] } });
    const result = await getRecommendations('product/id');
    expect(httpClient.get).toHaveBeenCalledWith('/products/product%2Fid/recommendations', { signal: undefined });
    expect(result).toEqual({ source: 'fallback', computedAt: null, items: [] });
  });

  it('rejects malformed recommendation payloads and unscored items', async () => {
    httpClient.get.mockResolvedValue({ data: { status: 'success', source: 'recommendation-engine', items: [
      { product: { _id: 'valid' }, score: 0.75 },
      { product: { _id: 'missing-score' } },
      { product: { name: 'missing id' }, score: 0.2 }
    ] } });
    expect((await getRecommendations('source')).items).toHaveLength(1);
    httpClient.get.mockResolvedValue({ data: { source: 'other', items: [] } });
    await expect(getRecommendations('source')).rejects.toThrow(/unexpected response/);
  });

  it('requires all dashboard metrics to be arrays and forwards the abort signal', async () => {
    const signal = new AbortController().signal;
    const expected = { status: 'success', revenueByCategory: [], topProducts: [], orderStatusBreakdown: [] };
    httpClient.get.mockResolvedValue({ data: expected });
    expect(await getAdminDashboard({ signal })).toEqual(expected);
    expect(httpClient.get).toHaveBeenCalledWith('/admin/dashboard', { signal });
    httpClient.get.mockResolvedValue({ data: { status: 'success', revenueByCategory: [] } });
    await expect(getAdminDashboard()).rejects.toThrow(/unexpected response/);
  });
});
