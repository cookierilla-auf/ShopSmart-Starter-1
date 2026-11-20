// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { api } from '../services/api.js';
import { AuthProvider } from '../context/AuthContext.jsx';
import AccountPage from './AccountPage.jsx';
import OrdersPage from './OrdersPage.jsx';
import OrderDetailsPage from './OrderDetailsPage.jsx';
import AssistantPage from './AssistantPage.jsx';

vi.mock('../services/api.js', () => ({
  api: { me: vi.fn(), login: vi.fn(), register: vi.fn(), logout: vi.fn(), getOrders: vi.fn(), getOrder: vi.fn(), askAssistant: vi.fn() }
}));

const ana = { id: 1, name: 'Ana Santos', email: 'ana@example.com' };
const guest = () => Object.assign(new Error('Sign in to continue.'), { status: 401 });

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/account" element={<AccountPage />} />
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/orders/:orderId" element={<OrderDetailsPage />} />
          <Route path="/assistant" element={<AssistantPage />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('accounts and orders', () => {
  afterEach(() => { cleanup(); vi.resetAllMocks(); });

  it('sends a guest who opens My orders to the sign-in page', async () => {
    api.me.mockRejectedValue(guest());
    renderAt('/orders');
    expect(await screen.findByRole('heading', { name: /Sign in to check out/ })).toBeTruthy();
    expect(api.getOrders).not.toHaveBeenCalled();
  });

  it('signs in and then shows only the orders the API returns for this customer', async () => {
    api.me.mockRejectedValue(guest());
    api.login.mockResolvedValue({ customer: ana });
    api.getOrders.mockResolvedValue([{ id: 42, total: 650, createdAt: '2026-11-20T08:00:00Z' }]);
    renderAt('/account?next=/orders');
    const form = await screen.findByRole('form', { name: 'Sign in' });
    fireEvent.change(form.querySelector('input[name="email"]'), { target: { value: 'ana@example.com' } });
    fireEvent.change(form.querySelector('input[name="password"]'), { target: { value: 'fictional-pass-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Order #42')).toBeTruthy();
    expect(api.login).toHaveBeenCalledWith({ email: 'ana@example.com', password: 'fictional-pass-1' });
  });

  it('shows the API error when sign-in fails', async () => {
    api.me.mockRejectedValue(guest());
    api.login.mockRejectedValue(Object.assign(new Error('Email or password is incorrect.'), { status: 401 }));
    renderAt('/account');
    const form = await screen.findByRole('form', { name: 'Sign in' });
    fireEvent.change(form.querySelector('input[name="email"]'), { target: { value: 'ana@example.com' } });
    fireEvent.change(form.querySelector('input[name="password"]'), { target: { value: 'wrong-pass' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Email or password is incorrect.')).toBeTruthy();
  });

  it("shows a not-found message for another customer's order (API 404)", async () => {
    api.me.mockResolvedValue({ customer: ana });
    api.getOrder.mockRejectedValue(Object.assign(new Error('Order not found.'), { status: 404 }));
    renderAt('/orders/7');
    expect(await screen.findByText('This order was not found in your account.')).toBeTruthy();
    expect(api.getOrder).toHaveBeenCalledWith('7');
  });

  it('labels answers from the simulated provider', async () => {
    api.me.mockRejectedValue(guest());
    api.askAssistant.mockResolvedValue({ answer: 'Simulated draft.', recommendedProducts: [], sources: [], mode: 'ai', provider: { name: 'mock', simulated: true } });
    renderAt('/assistant');
    fireEvent.change(screen.getByLabelText('Your question'), { target: { value: 'keyboard please' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ask ShopSmart' }));
    expect(await screen.findByText(/Simulated AI provider \(mock\)/)).toBeTruthy();
  });
});
