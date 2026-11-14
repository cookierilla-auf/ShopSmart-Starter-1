// Must match the per-product quantity limit in backend/src/validators/schemas.js (orderSchema).
export const MAX_QUANTITY_PER_ITEM = 20;

export function findCartItem(cart, productId) {
  return cart.find((item) => item.productId === productId);
}

/** The most units of one product a single order may contain: the stock, but never more than the API allows. */
export function maxOrderQuantity(item) {
  return Math.min(item.stock, MAX_QUANTITY_PER_ITEM);
}

// Money is added in whole centavos so totals such as 3 × ₱1,299.95 stay exact.
const toCentavos = (amount) => Math.round(Number(amount) * 100);

export function calculateItemSubtotal(item) {
  return (toCentavos(item.price) * item.quantity) / 100;
}

export function calculateCartTotal(cart) {
  return cart.reduce((total, item) => total + toCentavos(item.price) * item.quantity, 0) / 100;
}

export function calculateCartItemCount(cart) {
  return cart.reduce((count, item) => count + item.quantity, 0);
}

export function formatPeso(amount) {
  return `₱${Number(amount).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function limitMessage(item, name) {
  return item.stock > MAX_QUANTITY_PER_ITEM
    ? `You can order up to ${MAX_QUANTITY_PER_ITEM} units of ${name} per order.`
    : `Only ${item.stock} unit(s) of ${name} are available.`;
}

export function addProductToCart(cart, product) {
  const existingItem = findCartItem(cart, product.id);
  const currentQuantity = existingItem?.quantity ?? 0;

  if (currentQuantity >= maxOrderQuantity(product)) {
    return { cart, error: limitMessage(product, product.name) };
  }

  if (existingItem) {
    return {
      cart: cart.map((item) =>
        item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item
      ),
      error: ''
    };
  }

  return {
    cart: [...cart, {
      productId: product.id,
      name: product.name,
      price: Number(product.price),
      stock: product.stock,
      quantity: 1
    }],
    error: ''
  };
}

export function updateCartQuantity(cart, productId, quantity) {
  const item = findCartItem(cart, productId);
  if (!item) return { cart, error: 'Cart item could not be found.' };
  if (!Number.isInteger(quantity) || quantity < 1) {
    return { cart, error: 'Quantity must be a whole number greater than zero.' };
  }
  if (quantity > maxOrderQuantity(item)) {
    return { cart, error: item.stock > MAX_QUANTITY_PER_ITEM ? limitMessage(item, item.name) : `Only ${item.stock} unit(s) are available.` };
  }
  return {
    cart: cart.map((current) => current.productId === productId ? { ...current, quantity } : current),
    error: ''
  };
}
