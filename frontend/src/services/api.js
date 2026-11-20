// Same origin by default: on EC2, Caddy serves this build and proxies /api; in development Vite proxies /api.
// VITE_ values are bundled into public JavaScript, so only a public URL may go here, never a secret.
const API_URL = import.meta.env.VITE_API_URL || '/api';
const ASSISTANT_TIMEOUT_MS = 20_000;

async function request(path, options = {}) {
  const { timeoutMs, ...fetchOptions } = options;
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      credentials: 'same-origin',
      ...fetchOptions,
      headers: { 'Content-Type': 'application/json', ...fetchOptions.headers },
      ...(timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {})
    });
  } catch (caught) {
    const timedOut = caught?.name === 'TimeoutError' || caught?.name === 'AbortError';
    const error = new Error(timedOut
      ? 'ShopSmart took too long to respond. Please try again.'
      : 'ShopSmart could not reach the server. Check that the backend is running and try again.');
    error.code = timedOut ? 'CLIENT_TIMEOUT' : 'NETWORK_ERROR';
    throw error;
  }

  const data = await response.json().catch(() => null);
  if (response.status === 204) return null;
  if (!response.ok) {
    const message = data?.error?.message || `Request failed with status ${response.status}.`;
    const error = new Error(message);
    error.status = response.status;
    error.code = data?.error?.code;
    throw error;
  }
  return data;
}

export const api = {
  getProducts: (query = '') => request(`/products${query ? `?search=${encodeURIComponent(query)}` : ''}`),
  getProduct: (id) => request(`/products/${id}`),
  createOrder: (order) => request('/orders', { method: 'POST', body: JSON.stringify(order) }),
  getOrders: () => request('/orders'),
  getOrder: (id) => request(`/orders/${encodeURIComponent(id)}`),
  me: () => request('/auth/me'),
  register: (details) => request('/auth/register', { method: 'POST', body: JSON.stringify(details) }),
  login: (details) => request('/auth/login', { method: 'POST', body: JSON.stringify(details) }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  askAssistant: (question) => request('/assistant/questions', {
    method: 'POST', body: JSON.stringify({ question }), timeoutMs: ASSISTANT_TIMEOUT_MS
  })
};
