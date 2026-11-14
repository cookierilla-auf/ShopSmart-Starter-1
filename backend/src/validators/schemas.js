import { z } from 'zod';

// Must match MAX_QUANTITY_PER_ITEM in frontend/src/utils/cart.js.
export const MAX_QUANTITY_PER_ITEM = 20;

// These messages are shown to the customer at checkout, so each one names the field to correct.
export const orderSchema = z.object({
  customerName: z.string().trim()
    .min(2, 'Full name must have at least 2 characters.')
    .max(80, 'Full name must have at most 80 characters.'),
  email: z.email('Enter a complete email address, such as juan@example.com.'),
  address: z.string().trim()
    .min(10, 'Delivery address must have at least 10 characters.')
    .max(300, 'Delivery address must have at most 300 characters.'),
  items: z.array(z.object({
    productId: z.coerce.number().int().positive(),
    quantity: z.coerce.number().int()
      .min(1, 'Each cart quantity must be at least 1.')
      .max(MAX_QUANTITY_PER_ITEM, `Each product is limited to ${MAX_QUANTITY_PER_ITEM} units per order.`)
  })).min(1, 'Your cart is empty.').max(20, 'An order may contain at most 20 different products.').refine(
    (items) => new Set(items.map((item) => item.productId)).size === items.length,
    { message: 'Each product may appear only once in an order.' }
  )
});

export const assistantQuestionSchema = z.object({
  question: z.string().trim().min(3).max(300)
});
