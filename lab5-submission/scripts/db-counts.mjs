// Read-only: prints product, order and order-item counts so testers can prove the data was not reset.
// Run from the project root: node lab5-submission/scripts/db-counts.mjs
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../backend');
const require = createRequire(path.join(backendDir, 'package.json'));
require('dotenv').config({ path: path.join(backendDir, '.env'), quiet: true });
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
try {
  const [products, activeProducts, orders, orderItems, latestOrder] = await Promise.all([
    prisma.product.count(),
    prisma.product.count({ where: { active: true } }),
    prisma.order.count(),
    prisma.orderItem.count(),
    prisma.order.findFirst({ orderBy: { id: 'desc' }, select: { id: true, createdAt: true } })
  ]);
  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), products, activeProducts, orders, orderItems, latestOrderId: latestOrder?.id ?? null }, null, 2));
} finally {
  await prisma.$disconnect();
}
