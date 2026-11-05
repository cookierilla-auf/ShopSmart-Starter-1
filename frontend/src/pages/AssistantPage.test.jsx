// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { api } from '../services/api.js';
import AssistantPage from './AssistantPage.jsx';

vi.mock('../services/api.js', () => ({ api: { askAssistant: vi.fn() } }));

function ask(question) {
  render(<MemoryRouter><AssistantPage /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText('Your question'), { target: { value: question } });
  fireEvent.click(screen.getByRole('button', { name: 'Ask ShopSmart' }));
}

describe('AssistantPage', () => {
  afterEach(() => { cleanup(); vi.resetAllMocks(); });

  it('shows the answer, product link, sources and fallback notice', async () => {
    api.askAssistant.mockResolvedValue({
      answer: 'Compact Mechanical Keyboard costs ₱1,850 (8 in stock).',
      recommendedProducts: [{ id: 2, name: 'Compact Mechanical Keyboard', price: 1850, category: 'Accessories', stock: 8 }],
      sources: [{ type: 'product', id: 2, name: 'Compact Mechanical Keyboard', price: 1850, stock: 8 }],
      mode: 'rules',
      notice: 'The AI writer is unavailable right now, so this answer was written by ShopSmart\'s catalog rules.'
    });
    ask('Which keyboard is below ₱2,000?');

    expect(await screen.findByText(/costs ₱1,850/)).toBeTruthy();
    expect(screen.getByText(/AI writer is unavailable/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /Compact Mechanical Keyboard — ₱1,850/ }).getAttribute('href')).toBe('/products/2');
    expect(screen.getByRole('link', { name: 'Product #2 · Compact Mechanical Keyboard' }).getAttribute('href')).toBe('/products/2');
  });

  it('shows an honest no-match state without product links', async () => {
    api.askAssistant.mockResolvedValue({ answer: 'I could not find an active, in-stock ShopSmart product that matches that request.', recommendedProducts: [], sources: [], mode: 'no-match' });
    ask('Do you sell drones?');

    expect(await screen.findByText(/could not find/)).toBeTruthy();
    expect(screen.getByText(/No catalog product supports/)).toBeTruthy();
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it('ends loading and shows a readable error when the request fails', async () => {
    api.askAssistant.mockRejectedValue(new Error('ShopSmart could not reach the server.'));
    ask('keyboard');

    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'ShopSmart could not reach the server.');
    expect(screen.getByRole('button', { name: 'Ask ShopSmart' }).disabled).toBe(false);
  });
});
