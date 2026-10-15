// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { CartProvider } from '../context/CartContext.jsx';
import { api } from '../services/api.js';
import ProductsPage from './ProductsPage.jsx';

vi.mock('../services/api.js', () => ({ api: { getProducts: vi.fn() } }));

const catalog = [
  { id: 1, name: 'Wireless Mouse', description: 'Quiet mouse.', category: 'Accessories', price: 650, stock: 12 },
  { id: 2, name: 'Compact Mechanical Keyboard', description: 'Tactile switches.', category: 'Accessories', price: 1850, stock: 8 },
  { id: 3, name: 'USB-C Study Lamp', description: 'Adjustable lamp.', category: 'Study', price: 900, stock: 10 },
  { id: 4, name: '1080p Webcam', description: 'Full HD webcam with privacy cover.', category: 'Video', price: 1450, stock: 6 },
  { id: 5, name: 'Laptop Stand', description: 'Foldable stand.', category: 'Study', price: 1200, stock: 9 }
];

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function renderPage() {
  return render(<MemoryRouter><CartProvider><ProductsPage /></CartProvider></MemoryRouter>);
}

async function loadPage() {
  renderPage();
  await screen.findByRole('heading', { name: 'Wireless Mouse' });
}

function searchFor(value) {
  fireEvent.change(screen.getByLabelText('Search products'), { target: { value } });
}

function productNames() {
  return screen.queryAllByRole('heading', { level: 2 }).map((heading) => heading.textContent);
}

beforeEach(() => {
  api.getProducts.mockReset();
  api.getProducts.mockResolvedValue({ products: catalog });
});
afterEach(cleanup);

describe('live catalog search', () => {
  it('requests trimmed search terms, uses server results, and restores the catalog when cleared', async () => {
    await loadPage();
    // A server-returned name unrelated to the term proves there is no extra local text filter.
    api.getProducts.mockResolvedValueOnce({ products: [catalog[3]] });
    searchFor('  feature  ');
    await waitFor(() => expect(productNames()).toEqual(['1080p Webcam']));
    expect(api.getProducts).toHaveBeenLastCalledWith('feature');
    searchFor('');
    await screen.findByRole('heading', { name: 'Wireless Mouse' });
    expect(api.getProducts).toHaveBeenLastCalledWith('');
    expect(productNames()).toHaveLength(catalog.length);
  });

  it('keeps categories and selection through matching and empty results, and preserves sorting', async () => {
    await loadPage();
    const category = screen.getByLabelText('Category');
    const choices = [...category.options].map((option) => option.value);
    fireEvent.change(category, { target: { value: 'Study' } });
    fireEvent.change(screen.getByLabelText('Sort'), { target: { value: 'price-desc' } });
    expect(productNames()).toEqual(['Laptop Stand', 'USB-C Study Lamp']);
    api.getProducts.mockResolvedValueOnce({ products: [catalog[2]] });
    searchFor('lamp');
    await waitFor(() => expect(productNames()).toEqual(['USB-C Study Lamp']));
    api.getProducts.mockResolvedValueOnce({ products: [catalog[3]] });
    searchFor('webcam');
    await screen.findByText('No products match your filters.');
    expect(category.value).toBe('Study');
    expect([...category.options].map((option) => option.value)).toEqual(choices);
    expect(screen.getByLabelText('Sort').value).toBe('price-desc');
    api.getProducts.mockResolvedValueOnce({ products: [] });
    searchFor('notfoundword');
    await screen.findByText('No products match your filters.');
    expect([...category.options].map((option) => option.value)).toEqual(choices);
    searchFor('');
    await waitFor(() => expect(productNames()).toEqual(['Laptop Stand', 'USB-C Study Lamp']));
    fireEvent.change(category, { target: { value: 'All' } });
    fireEvent.change(screen.getByLabelText('Sort'), { target: { value: 'price-asc' } });
    expect(productNames()).toEqual(['Wireless Mouse', 'USB-C Study Lamp', 'Laptop Stand', '1080p Webcam', 'Compact Mechanical Keyboard']);
    fireEvent.change(screen.getByLabelText('Sort'), { target: { value: 'name-asc' } });
    expect(productNames()).toEqual(catalog.map((product) => product.name).sort((a, b) => a.localeCompare(b)));
    fireEvent.change(screen.getByLabelText('Sort'), { target: { value: 'default' } });
    expect(productNames()).toEqual(catalog.map((product) => product.name));
  });

  it('hides old cards during loading, reports failures, and recovers on the next search', async () => {
    await loadPage();
    const pending = deferred();
    api.getProducts.mockReturnValueOnce(pending.promise);
    searchFor('privacy');
    expect(screen.getByText('Loading products…')).toBeTruthy();
    expect(productNames()).toEqual([]);
    await act(async () => pending.reject(new Error('Server unavailable.')));
    expect(screen.getByRole('alert').textContent).toContain('Server unavailable.');
    expect(screen.queryByText('No products match your filters.')).toBeNull();
    expect(productNames()).toEqual([]);
    searchFor('');
    await screen.findByRole('heading', { name: 'Wireless Mouse' });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('ignores a privacy response arriving after search was cleared', async () => {
    await loadPage();
    const privacy = deferred();
    const cleared = deferred();
    api.getProducts.mockReturnValueOnce(privacy.promise).mockReturnValueOnce(cleared.promise);
    searchFor('privacy');
    searchFor('');
    await act(async () => cleared.resolve({ products: catalog }));
    await act(async () => privacy.resolve({ products: [catalog[3]] }));
    expect(productNames()).toHaveLength(catalog.length);
    expect(screen.queryByText('Loading products…')).toBeNull();
  });

  it.each(['success', 'failure'])('ignores stale %s and its loading update while the latest request is pending', async (outcome) => {
    await loadPage();
    const older = deferred();
    const latest = deferred();
    api.getProducts.mockReturnValueOnce(older.promise).mockReturnValueOnce(latest.promise);
    searchFor('privacy');
    searchFor('keyboard');
    await act(async () => {
      if (outcome === 'success') older.resolve({ products: [catalog[3]] });
      else older.reject(new Error('Old failure'));
    });
    expect(screen.getByText('Loading products…')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    await act(async () => latest.resolve({ products: [catalog[1]] }));
    expect(productNames()).toEqual(['Compact Mechanical Keyboard']);
  });

  it('loads category choices even if the initial search request is superseded', async () => {
    const categories = deferred();
    const initial = deferred();
    api.getProducts.mockReturnValueOnce(categories.promise).mockReturnValueOnce(initial.promise)
      .mockResolvedValueOnce({ products: [catalog[3]] });
    renderPage();
    searchFor('privacy');
    await screen.findByRole('heading', { name: '1080p Webcam' });
    await act(async () => categories.resolve({ products: catalog }));
    expect([...screen.getByLabelText('Category').options].map((option) => option.value))
      .toEqual(['All', 'Accessories', 'Study', 'Video']);
    await act(async () => initial.resolve({ products: catalog }));
    expect(productNames()).toEqual(['1080p Webcam']);
  });

  it('reports category failure separately and retries categories after clearing search', async () => {
    const initial = deferred();
    api.getProducts.mockRejectedValueOnce(new Error('offline')).mockReturnValueOnce(initial.promise)
      .mockResolvedValueOnce({ products: [catalog[3]] });
    renderPage();
    searchFor('privacy');
    await screen.findByText('Could not load category choices. Clear search to retry.');
    await screen.findByRole('heading', { name: '1080p Webcam' });
    searchFor('');
    await screen.findByRole('heading', { name: 'Wireless Mouse' });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('option', { name: 'Study' })).toBeTruthy();
    await act(async () => initial.resolve({ products: catalog }));
  });

  it('ignores a late category failure after an unfiltered request recovered categories', async () => {
    const categories = deferred();
    api.getProducts.mockReturnValueOnce(categories.promise);
    await loadPage();
    await act(async () => categories.reject(new Error('Old category failure')));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('option', { name: 'Study' })).toBeTruthy();
  });
});
