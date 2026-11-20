import crypto from 'node:crypto';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import productsRouter from './routes/products.js';
import ordersRouter from './routes/orders.js';
import { createAssistantRouter } from './routes/assistant.js';
import { createAuthRouter } from './routes/auth.js';
import { loadCustomer } from './lib/auth.js';
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
  // Behind Caddy on EC2 the client IP arrives in X-Forwarded-For. Trusting exactly one proxy hop lets
  // rate limits see real visitors without letting a client spoof its own IP.
  const trustProxy = process.env.TRUST_PROXY;
  if (trustProxy) app.set('trust proxy', /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy);
  app.use(helmet());
  // The hosted site serves the frontend and /api from one origin, so CORS is only needed for local tools.
  app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173', credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  // CSRF guard alongside SameSite=Lax: state-changing API calls must be JSON, which a plain HTML form cannot send.
  app.use('/api', (request, response, next) => {
    const hasBody = Number(request.headers['content-length'] || 0) > 0 || Boolean(request.headers['transfer-encoding']);
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method) && hasBody && !request.is('application/json')) {
      return response.status(415).json({ error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Send requests as application/json.' } });
    }
    next();
  });
  app.use((request, response, next) => { request.id = crypto.randomUUID(); response.setHeader('X-Request-ID', request.id); next(); });
  // Logs method, path, status and request id only: never bodies, cookies or headers, so no password or token is logged.
  morgan.token('id', (request) => request.id);
  app.use(morgan(':method :url :status :response-time ms id=:id'));
  app.use('/api', loadCustomer(db));

  app.get('/api/health', async (_request, response) => {
    if (await databaseReachable(db)) return response.json({ status: 'ok', database: 'ok' });
    response.status(503).json({ status: 'degraded', database: 'unreachable' });
  });
  app.use('/api/products', productsRouter);
  app.use('/api/auth', createAuthRouter({ db, ...options.auth }));
  app.use('/api/orders', ordersRouter);
  app.use('/api/assistant', createAssistantRouter(options.assistant));
  app.use((_request, response) => response.status(404).json({ error: { code: 'ROUTE_NOT_FOUND', message: 'API route could not be found.' } }));
  app.use((error, request, response, _next) => {
    console.error(`[${request.id}]`, error);
    response.status(error.status || 500).json({ error: { code: error.code || 'INTERNAL_ERROR', message: error.status ? error.message : 'The server could not complete the request.', traceId: request.id } });
  });
  return app;
}
