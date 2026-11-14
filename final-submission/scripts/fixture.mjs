// Adds or removes ONE disposable fictional product used to reproduce defect D1 (stock above the 20-unit order cap).
// Usage (project root): node final-submission/scripts/fixture.mjs add|remove
// "remove" deletes only this fixture and any test order lines that reference it; no other product or order is touched.
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURE_NAME = 'Test Bulk Cable (fixture)';
const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../backend');
const require = createRequire(path.join(backendDir, 'package.json'));
require('dotenv').config({ path: path.join(backendDir, '.env'), quiet: true });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const action = process.argv[2];
try {
  if (action === 'add') {
    const existing = await prisma.product.findFirst({ where: { name: FIXTURE_NAME } });
    const product = existing ?? await prisma.product.create({
      data: { name: FIXTURE_NAME, description: 'Disposable test product for the bulk-quantity checkout case.', category: 'Accessories', emoji: '🔌', price: 99, stock: 25 }
    });
    console.log(JSON.stringify({ fixture: product.id, stock: product.stock }));
  } else if (action === 'remove') {
    const fixtures = await prisma.product.findMany({ where: { name: FIXTURE_NAME }, select: { id: true } });
    const ids = fixtures.map((f) => f.id);
    const result = await prisma.$transaction(async (tx) => {
      const lines = await tx.orderItem.findMany({ where: { productId: { in: ids } }, select: { orderId: true } });
      const orderIds = [...new Set(lines.map((l) => l.orderId))];
      // Only orders that contain nothing but fixture lines are removed; mixed orders keep their other lines.
      const orders = await tx.order.findMany({ where: { id: { in: orderIds } }, include: { items: true } });
      const fixtureOnly = orders.filter((o) => o.items.every((i) => ids.includes(i.productId))).map((o) => o.id);
      await tx.orderItem.deleteMany({ where: { productId: { in: ids } } });
      await tx.order.deleteMany({ where: { id: { in: fixtureOnly } } });
      const removed = await tx.product.deleteMany({ where: { id: { in: ids } } });
      return { productsRemoved: removed.count, fixtureOrdersRemoved: fixtureOnly.length };
    });
    console.log(JSON.stringify(result));
  } else {
    console.error('Usage: node final-submission/scripts/fixture.mjs add|remove');
    process.exitCode = 1;
  }
} finally {
  await prisma.$disconnect();
}
