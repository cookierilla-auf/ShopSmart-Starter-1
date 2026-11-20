import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import StatusMessage from '../components/StatusMessage.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../services/api.js';
import { formatPeso } from '../utils/cart.js';
import { formatDate } from '../utils/date.js';

export default function OrderDetailsPage() {
  const { orderId } = useParams();
  const { customer, checking } = useAuth();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!customer) return;
    setOrder(null); setError('');
    // The API returns 404 both for a missing order and for another customer's order.
    api.getOrder(orderId).then(setOrder).catch((caught) => setError(caught.status === 404 ? 'This order was not found in your account.' : caught.message));
  }, [customer, orderId]);

  if (checking) return <section><StatusMessage>Checking your session…</StatusMessage></section>;
  if (!customer) return <Navigate to={`/account?next=/orders/${encodeURIComponent(orderId)}`} replace />;

  return (
    <section>
      <p className="eyebrow">ORDER DETAILS</p>
      <StatusMessage type="error">{error}</StatusMessage>
      {!order && !error && <StatusMessage>Loading order…</StatusMessage>}
      {order && <>
        <h1>Order #{order.id}</h1>
        <p>Placed {formatDate(order.createdAt)} · Status: <strong>{order.status}</strong></p>
        <p>Deliver to {order.customerName}, {order.address}</p>
        <table className="order-lines">
          <thead><tr><th>Product</th><th>Qty</th><th>Unit price</th><th>Subtotal</th></tr></thead>
          <tbody>
            {order.items.map((item) => (
              <tr key={item.id}>
                <td>{item.product ? `${item.product.emoji} ${item.product.name}` : `Product #${item.productId}`}</td>
                <td>{item.quantity}</td>
                <td>{formatPeso(item.unitPrice)}</td>
                <td>{formatPeso(item.unitPrice * item.quantity)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="summary-total"><span>Total </span><strong>{formatPeso(order.total)}</strong></p>
      </>}
      <Link className="button" to="/orders">Back to my orders</Link>
    </section>
  );
}
