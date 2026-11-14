import { describe, expect, it } from 'vitest';
import { MAX_QUANTITY_PER_ITEM, addProductToCart, calculateCartItemCount, calculateCartTotal, formatPeso, maxOrderQuantity, updateCartQuantity } from './cart.js';

describe('cart utilities', () => {
  it('calculates the cart total', () => {
    expect(calculateCartTotal([
      { price: 100, quantity: 2 },
      { price: 50, quantity: 3 }
    ])).toBe(350);
  });

  it('adds a new product', () => {
    const result = addProductToCart([], { id: 1, name: 'Mouse', price: 500, stock: 2 });
    expect(result.error).toBe('');
    expect(result.cart[0].quantity).toBe(1);
  });

  it('prevents a quantity above stock', () => {
    const cart = [{ productId: 1, name: 'Mouse', price: 500, stock: 1, quantity: 1 }];
    expect(updateCartQuantity(cart, 1, 2).error).toContain('Only 1');
  });

  it('refuses a quantity below one and leaves the cart unchanged', () => {
    const cart = [{ productId: 1, name: 'Mouse', price: 500, stock: 3, quantity: 1 }];
    const result = updateCartQuantity(cart, 1, 0);
    expect(result.error).toContain('greater than zero');
    expect(result.cart).toBe(cart);
  });

  it('counts all cart units and handles an empty cart', () => {
    expect(calculateCartItemCount([{ quantity: 2 }, { quantity: 3 }])).toBe(5);
    expect(calculateCartItemCount([])).toBe(0);
  });

  // D1: the API accepts at most 20 units of one product per order, so the cart must not allow more.
  it('caps a typed quantity at the 20-unit order limit even when stock is higher', () => {
    const cart = [{ productId: 9, name: 'Bulk Cable', price: 99, stock: 25, quantity: 1 }];
    expect(MAX_QUANTITY_PER_ITEM).toBe(20);
    expect(maxOrderQuantity(cart[0])).toBe(20);
    expect(updateCartQuantity(cart, 9, 20).cart[0].quantity).toBe(20);
    const refused = updateCartQuantity(cart, 9, 21);
    expect(refused.error).toContain('up to 20');
    expect(refused.cart).toBe(cart);
  });

  it('stops Add to cart at the 20-unit order limit', () => {
    const product = { id: 9, name: 'Bulk Cable', price: 99, stock: 25 };
    const cart = [{ productId: 9, name: 'Bulk Cable', price: 99, stock: 25, quantity: 20 }];
    const result = addProductToCart(cart, product);
    expect(result.error).toContain('up to 20');
    expect(result.cart).toBe(cart);
  });

  it('still uses stock as the limit when stock is below 20', () => {
    expect(maxOrderQuantity({ stock: 6 })).toBe(6);
  });

  // D4: totals are summed in centavos and always shown with two decimals.
  it('adds centavo prices without floating-point drift', () => {
    // Plain floating-point gives 3899.8500000000004 and 59.699999999999996 for these lines.
    expect(calculateCartTotal([{ price: 1299.95, quantity: 3 }])).toBe(3899.85);
    expect(calculateCartTotal([
      { price: 19.9, quantity: 3 },
      { price: 49.95, quantity: 7 }
    ])).toBe(409.35);
  });

  it('formats every peso amount with two decimals', () => {
    expect(formatPeso(3400)).toBe('₱3,400.00');
    expect(formatPeso(2079)).toBe('₱2,079.00');
    expect(formatPeso(59.97)).toBe('₱59.97');
  });
});
