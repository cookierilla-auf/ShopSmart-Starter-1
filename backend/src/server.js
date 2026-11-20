import 'dotenv/config';
import { createApp } from './app.js';
import { prisma } from './lib/prisma.js';

const port = Number(process.env.PORT || 3000);
// On EC2 HOST=127.0.0.1 keeps the raw API port private; only Caddy (443) is public.
const host = process.env.HOST || '0.0.0.0';
const server = createApp().listen(port, host, () => console.log(`ShopSmart API listening on ${host}:${port}`));

async function shutdown(signal) {
  console.log(`\n${signal} received. Closing ShopSmart API.`);
  server.close(async () => { await prisma.$disconnect(); process.exit(0); });
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
