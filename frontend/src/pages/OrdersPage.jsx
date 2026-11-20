import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import StatusMessage from '../components/StatusMessage.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../services/api.js';
import { formatPeso } from '../utils/cart.js';
import { formatDate } from '../utils/date.js';

export default function OrdersPage() {
  const { customer, checking } = useAuth();
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!customer) return;
    api.getOrders().then(setOrders).catch((caught) => setError(caught.message));
  }, [customer]);

  if (checking) return <section><StatusMessage>Checking your session…</StatusMessage></section>;
  if (!customer) return <Navigate to="/account?next=/orders" replace />;

  return (
    <section>
      <p className="eyebrow">MY ORDERS</p>
      <h1>Simulated orders for {customer.name}</h1>
      <StatusMessage type="error">{error}</StatusMessage>
      {!orders && !error && <StatusMessage>Loading your orders…</StatusMessage>}
      {orders?.length === 0 && <div className="empty-state"><p>You have not placed any orders yet.</p><Link className="button" to="/">Browse products</Link></div>}
      {orders?.length > 0 && <ul className="orders-list">
        {orders.map((order) => (
          <li key={order.id}>
            <Link to={`/orders/${order.id}`}>
              <strong>Order #{order.id}</strong>
              <span>{formatDate(order.createdAt)}</span>
              <strong>{formatPeso(order.total)}</strong>
            </Link>
          </li>
        ))}
      </ul>}
    </section>
  );
}
