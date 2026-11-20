import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import StatusMessage from '../components/StatusMessage.jsx';
import { useCart } from '../context/CartContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../services/api.js';
import { calculateItemSubtotal, formatPeso } from '../utils/cart.js';

export default function CheckoutPage() {
  const { cart, total, clearCart } = useCart();
  const { customer, checking } = useAuth();
  // Name and email start from the signed-in account; the order owner itself is set by the server from the session.
  const [form, setForm] = useState({ customerName: customer?.name || '', email: customer?.email || '', address: '' });
  // The session check may finish after the first render, so fill any still-empty fields once the customer is known.
  useEffect(() => {
    if (customer) setForm((current) => ({ ...current, customerName: current.customerName || customer.name, email: current.email || customer.email }));
  }, [customer]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [order, setOrder] = useState(null);

  function updateField(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  async function submitOrder(event) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const created = await api.createOrder({
        ...form,
        items: cart.map((item) => ({ productId: item.productId, quantity: item.quantity }))
      });
      setOrder(created);
      clearCart();
    } catch (caught) {
      setError(caught.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (order) return (
    <section className="success-card">
      <p className="eyebrow">ORDER RECEIVED</p>
      <h1>Thank you, {order.customerName}!</h1>
      <p>Your simulated order number is <strong>#{order.id}</strong>.</p>
      <p>Total: <strong>{formatPeso(order.total)}</strong></p>
      <div className="card-actions">
        <Link className="button" to={`/orders/${order.id}`}>View order</Link>
        <Link className="button" to="/">Continue shopping</Link>
      </div>
    </section>
  );

  if (checking) return <section><StatusMessage>Checking your session…</StatusMessage></section>;
  if (!customer) return <Navigate to="/account?next=/checkout" replace />;
  if (cart.length === 0) return <section><div className="empty-state"><h1>Your cart is empty</h1><Link className="button" to="/">Browse products</Link></div></section>;

  return (
    <section className="checkout-layout">
      <form onSubmit={submitOrder}>
        <p className="eyebrow">SIMULATED CHECKOUT</p><h1>Delivery information</h1>
        <StatusMessage type="error">{error}</StatusMessage>
        <label>Full name<input name="customerName" value={form.customerName} onChange={updateField} minLength="2" maxLength="80" required /></label>
        <label>Email address<input name="email" type="email" value={form.email} onChange={updateField} required /></label>
        <label>Delivery address<textarea name="address" value={form.address} onChange={updateField} minLength="10" maxLength="300" required /></label>
        <button disabled={submitting}>{submitting ? 'Submitting order…' : 'Place simulated order'}</button>
      </form>
      <aside className="summary">
        <h2>Amount due</h2>
        <div className="checkout-items">
          {cart.map((item) => (
            <p key={item.productId}>
              <span>{item.name} × {item.quantity}</span>
              <strong>{formatPeso(calculateItemSubtotal(item))}</strong>
            </p>
          ))}
        </div>
        <p className="summary-total"><span>Total</span><strong>{formatPeso(total)}</strong></p>
        <small>No actual payment will be collected.</small>
      </aside>
    </section>
  );
}
