import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { requireCustomer } from '../lib/auth.js';
import { orderSchema } from '../validators/schemas.js';
const router = Router();

const toJson = (order) => ({ ...order, total: Number(order.total), items: order.items.map((item) => ({ ...item, unitPrice: Number(item.unitPrice) })) });
const ORDER_ITEMS = { items: { include: { product: { select: { id: true, name: true, emoji: true } } } } };

// Every order route needs a signed-in customer. The owner always comes from the session, never from the request body.
router.use(requireCustomer);

router.post('/', async (request, response, next) => {
  try {
    const parsed = orderSchema.safeParse(request.body);
    if (!parsed.success) {
      // Name every field that failed, so the customer knows what to correct (the browser accepts emails such as juan@example).
      const reasons = [...new Set(parsed.error.issues.map((issue) => issue.message))];
      return response.status(422).json({ error: { code: 'INVALID_ORDER', message: `Check the customer and cart information: ${reasons.join(' ')}`, details: parsed.error.flatten() } });
    }

    const productIds = [...new Set(parsed.data.items.map((item) => item.productId))];
    const products = await prisma.product.findMany({ where: { id: { in: productIds }, active: true } });
    if (products.length !== productIds.length) return response.status(422).json({ error: { code: 'PRODUCT_UNAVAILABLE', message: 'One or more products are unavailable.' } });

    const productMap = new Map(products.map((product) => [product.id, product]));
    const normalizedItems = parsed.data.items.map((item) => ({ ...item, product: productMap.get(item.productId) }));
    const unavailable = normalizedItems.find((item) => item.quantity > item.product.stock);
    if (unavailable) return response.status(409).json({ error: { code: 'INSUFFICIENT_STOCK', message: `Only ${unavailable.product.stock} unit(s) of ${unavailable.product.name} are available.` } });

    const total = normalizedItems.reduce((sum, item) => sum.plus(new Prisma.Decimal(item.product.price).times(item.quantity)), new Prisma.Decimal(0));
    const order = await prisma.$transaction(async (transaction) => {
      for (const item of normalizedItems) {
        const updated = await transaction.product.updateMany({
          where: { id: item.productId, stock: { gte: item.quantity } },
          data: { stock: { decrement: item.quantity } }
        });
        if (updated.count !== 1) throw Object.assign(new Error('Stock changed while placing the order.'), { status: 409, code: 'STOCK_CHANGED' });
      }
      return transaction.order.create({
        data: {
          customerId: request.customer.id, customerName: parsed.data.customerName, email: parsed.data.email, address: parsed.data.address, total,
          items: { create: normalizedItems.map((item) => ({ productId: item.productId, quantity: item.quantity, unitPrice: item.product.price })) }
        },
        include: { items: true }
      });
    });
    response.status(201).json(toJson(order));
  } catch (error) { next(error); }
});

// Lists only the signed-in customer's own orders.
router.get('/', async (request, response, next) => {
  try {
    const orders = await prisma.order.findMany({
      where: { customerId: request.customer.id }, include: ORDER_ITEMS, orderBy: { createdAt: 'desc' }, take: 50
    });
    response.json(orders.map(toJson));
  } catch (error) { next(error); }
});

// The ownership check is part of the query: another customer's order id returns the same 404 as a missing one,
// so the API does not reveal which order ids exist.
router.get('/:id', async (request, response, next) => {
  try {
    const id = Number(request.params.id);
    const notFound = { error: { code: 'ORDER_NOT_FOUND', message: 'Order not found.' } };
    if (!Number.isInteger(id) || id <= 0) return response.status(404).json(notFound);
    const order = await prisma.order.findFirst({ where: { id, customerId: request.customer.id }, include: ORDER_ITEMS });
    if (!order) return response.status(404).json(notFound);
    response.json(toJson(order));
  } catch (error) { next(error); }
});

export default router;
