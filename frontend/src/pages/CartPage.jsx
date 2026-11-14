import { Link } from 'react-router-dom';
import StatusMessage from '../components/StatusMessage.jsx';
import { useCart } from '../context/CartContext.jsx';
import { calculateItemSubtotal, formatPeso, maxOrderQuantity } from '../utils/cart.js';

const CART_ERROR = /^(Only|You can order up to|Quantity must)/;

export default function CartPage() {
  const { cart, total, itemCount, cartMessage, setQuantity, removeFromCart } = useCart();

  return (
    <section>
      <div className="page-heading"><p className="eyebrow">YOUR ORDER</p><h1>Shopping cart</h1></div>
      <StatusMessage type={CART_ERROR.test(cartMessage) ? 'error' : 'info'}>{cartMessage}</StatusMessage>
      {cart.length === 0 ? (
        <div className="empty-state"><h2>Your cart is empty</h2><Link className="button" to="/">Browse products</Link></div>
      ) : (
        <div className="cart-layout">
          <div className="cart-items">
            {cart.map((item) => (
              <article className="cart-item" key={item.productId}>
                <div><h2>{item.name}</h2><p>{formatPeso(item.price)} each</p></div>
                <div className="quantity-control">
                  <button type="button" aria-label={`Decrease quantity of ${item.name}`}
                    disabled={item.quantity <= 1}
                    onClick={() => setQuantity(item.productId, item.quantity - 1)}>−</button>
                  <label>Quantity
                    <input type="number" min="1" max={maxOrderQuantity(item)} value={item.quantity}
                      onChange={(event) => setQuantity(item.productId, Number(event.target.value))} />
                  </label>
                  <button type="button" aria-label={`Increase quantity of ${item.name}`}
                    disabled={item.quantity >= maxOrderQuantity(item)}
                    onClick={() => setQuantity(item.productId, item.quantity + 1)}>+</button>
                </div>
                <strong>{formatPeso(calculateItemSubtotal(item))}</strong>
                <button className="danger" onClick={() => removeFromCart(item.productId)}>Remove</button>
              </article>
            ))}
          </div>
          <aside className="summary">
            <h2>Order summary</h2>
            <p><span>Items</span><strong>{itemCount}</strong></p>
            <p className="summary-total"><span>Total</span><strong>{formatPeso(total)}</strong></p>
            <Link className="button full" to="/checkout">Proceed to checkout</Link>
          </aside>
        </div>
      )}
    </section>
  );
}
