import crypto from 'node:crypto';
import { promisify } from 'node:util';

// ShopSmart customer identity (not AWS IAM). Sessions are opaque random tokens in an HttpOnly cookie;
// the database keeps only a SHA-256 hash of each token, and passwords only as salted scrypt hashes.
const scrypt = promisify(crypto.scrypt);
const KEY_LENGTH = 64;
export const SESSION_COOKIE = 'sid';
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, saltText, keyText] = String(stored || '').split('$');
  if (scheme !== 'scrypt' || !saltText || !keyText) return false;
  const expected = Buffer.from(keyText, 'base64');
  const actual = await scrypt(password, Buffer.from(saltText, 'base64'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

// Used when the email is unknown, so a failed login takes about as long whether or not the account exists.
const DUMMY_HASH = 'scrypt$AAAAAAAAAAAAAAAAAAAAAA==$' + Buffer.alloc(KEY_LENGTH).toString('base64');
export const verifyAgainstDummy = (password) => verifyPassword(password, DUMMY_HASH);

export const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
export const newSessionToken = () => crypto.randomBytes(32).toString('base64url');

export function parseCookies(header = '') {
  const cookies = {};
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const name = part.slice(0, index).trim();
    if (!name || name in cookies) continue;
    try { cookies[name] = decodeURIComponent(part.slice(index + 1).trim()); } catch { /* ignore a malformed cookie */ }
  }
  return cookies;
}

function cookieAttributes(maxAgeSeconds) {
  const attributes = ['Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSeconds}`];
  // Browsers only send a Secure cookie over HTTPS, so it is required on the hosted site and skipped on localhost.
  if (process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true') attributes.push('Secure');
  return attributes.join('; ');
}

export function setSessionCookie(response, token) {
  response.append('Set-Cookie', `${SESSION_COOKIE}=${token}; ${cookieAttributes(Math.floor(SESSION_TTL_MS / 1000))}`);
}

export function clearSessionCookie(response) {
  response.append('Set-Cookie', `${SESSION_COOKIE}=; ${cookieAttributes(0)}`);
}

export const publicCustomer = (customer) => ({ id: customer.id, name: customer.name, email: customer.email });

export async function createSession(db, customerId) {
  const token = newSessionToken();
  await db.session.create({ data: { tokenHash: hashToken(token), customerId, expiresAt: new Date(Date.now() + SESSION_TTL_MS) } });
  return token;
}

/** Sets request.customer when a valid, unexpired session cookie is present. Never rejects by itself. */
export function loadCustomer(db) {
  return async (request, _response, next) => {
    request.customer = null;
    const token = parseCookies(request.headers.cookie)[SESSION_COOKIE];
    if (!token) return next();
    try {
      const session = await db.session.findUnique({ where: { tokenHash: hashToken(token) }, include: { customer: true } });
      if (session && session.expiresAt > new Date()) {
        request.customer = publicCustomer(session.customer);
        request.sessionTokenHash = session.tokenHash;
      }
      next();
    } catch (error) { next(error); }
  };
}

export function requireCustomer(request, response, next) {
  if (!request.customer) return response.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Sign in to continue.' } });
  next();
}
