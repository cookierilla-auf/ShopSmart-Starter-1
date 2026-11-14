import crypto from 'node:crypto';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import productsRouter from './routes/products.js';
import ordersRouter from './routes/orders.js';
import { createAssistantRouter } from './routes/assistant.js';
import { prisma } from './lib/prisma.js';

const HEALTH_DB_TIMEOUT_MS = 3000;

// A health check that ignores the database would report a deployment healthy while every catalog request fails.
async function databaseReachable(db) {
  let timer;
  try {
    await Promise.race([
      db.$queryRaw`SELECT 1`,
      new Promise((_resolve, reject) => { timer = setTimeout(() => reject(new Error('Database health check timed out.')), HEALTH_DB_TIMEOUT_MS); })
    ]);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export function createApp(options = {}) {
  const { db = prisma } = options;
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }));
  app.use(express.json({ limit: '100kb' }));
  app.use((request, response, next) => { request.id = crypto.randomUUID(); response.setHeader('X-Request-ID', request.id); next(); });
  app.use(morgan(':method :url :status :response-time ms'));

  app.get('/api/health', async (_request, response) => {
    if (await databaseReachable(db)) return response.json({ status: 'ok', database: 'ok' });
    response.status(503).json({ status: 'degraded', database: 'unreachable' });
  });
  app.use('/api/products', productsRouter);
  app.use('/api/orders', ordersRouter);
  app.use('/api/assistant', createAssistantRouter(options.assistant));
  app.use((_request, response) => response.status(404).json({ error: { code: 'ROUTE_NOT_FOUND', message: 'API route could not be found.' } }));
  app.use((error, request, response, _next) => {
    console.error(`[${request.id}]`, error);
    response.status(error.status || 500).json({ error: { code: error.code || 'INTERNAL_ERROR', message: error.status ? error.message : 'The server could not complete the request.', traceId: request.id } });
  });
  return app;
}
