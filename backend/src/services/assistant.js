import { z } from 'zod';

// Words that describe the request rather than the product, so they must not count as matches.
const STOPWORDS = new Set(`
which what who where when how why are was were the and for with without that this these those
does did you your yours our can could would should will shall may might any some something anything
have has had need needs want wants looking look find show give get buy recommend recommendation suggest
please there here its below under less than more cheaper cheap cheapest affordable budget price priced
cost costs php peso pesos max maximum within upto best good great nice item items product products
sell sells selling available stock shopsmart thing things one ones around about also just like really
very much many only other others between least most less over them they from into currently today
use using used help helps make work works
`.trim().split(/\s+/));

const MAX_FACTS = 3;

/** Returns a peso budget only when the number is clearly a price, so "1080p webcam" is not a budget. */
export function parseBudget(question) {
  const normalized = question.replace(/(\d),(?=\d{3}\b)/g, '$1');
  const match = normalized.match(
    /(?:\b(?:below|under|less than|cheaper than|at most|max(?:imum)?|up to|within|no more than|budget(?:\s+(?:of|is))?)\s*(?:₱|php|p)?\s*|₱\s*|\bphp\s*|\bp(?=\d))(\d+(?:\.\d{1,2})?)(?![\d.]|p\b)/i
  );
  return match ? Number(match[1]) : null;
}

/** Meaningful search terms from the question: no filler words, no bare numbers, simple plural stemming. */
export function extractTerms(question) {
  const terms = question.toLowerCase().split(/[^a-z0-9]+/)
    .filter((term) => term.length > 2 && !STOPWORDS.has(term) && !/^(?:p|php)?\d+$/.test(term))
    .map((term) => (term.length > 3 && term.endsWith('s') && !term.endsWith('ss') ? term.slice(0, -1) : term));
  return [...new Set(terms)];
}

// Whole-word match, allowing a shared stem of 4+ letters ("studying" ~ "study"), so "use" no longer matches "mouse".
function termMatches(term, words) {
  return words.some((word) => word === term || (word.length >= 4 && term.startsWith(word)) || (term.length >= 4 && word.startsWith(term)));
}

export function rankProducts(products, question) {
  const terms = extractTerms(question);
  const budget = parseBudget(question);
  const eligible = products
    .filter((product) => product.active !== false && product.stock > 0 && (budget === null || Number(product.price) <= budget))
    .map((product) => {
      const words = `${product.name} ${product.category} ${product.description}`.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
      return { ...product, score: terms.reduce((score, term) => score + (termMatches(term, words) ? 1 : 0), 0) };
    });
  // A question that names something must match it; keep only the best-matching tier.
  const bestScore = Math.max(0, ...eligible.map((product) => product.score));
  return eligible
    .filter((product) => (terms.length === 0 ? true : product.score > 0 && product.score === bestScore))
    .sort((a, b) => b.score - a.score || Number(a.price) - Number(b.price));
}

/** The only product fields the provider ever sees: public catalog facts, with Decimal price converted once. */
export function selectCatalogFacts(products, question) {
  return rankProducts(products, question).slice(0, MAX_FACTS).map((product) => ({
    id: product.id,
    name: product.name,
    description: product.description,
    category: product.category,
    price: Number(product.price),
    stock: product.stock
  }));
}

export function formatPeso(amount) {
  const value = Number(amount);
  return `₱${value.toLocaleString('en-PH', { minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 2 })}`;
}

function toResponseProducts(facts) {
  return {
    recommendedProducts: facts.map(({ id, name, price, category, stock }) => ({ id, name, price, category, stock })),
    sources: facts.map(({ id, name, price, stock }) => ({ type: 'product', id, name, price, stock }))
  };
}

function noMatchAnswer(budget) {
  const budgetText = budget === null ? '' : ` at or below ${formatPeso(budget)}`;
  return `I could not find an active, in-stock ShopSmart product that matches that request${budgetText}. Try a different product type or budget.`;
}

function ruleAnswer(facts, budget) {
  const budgetText = budget === null ? '' : ` at or below ${formatPeso(budget)}`;
  const intro = facts.length === 1
    ? `One in-stock product in the current ShopSmart catalog matches${budgetText}.`
    : `${facts.length} in-stock products in the current ShopSmart catalog match${budgetText}.`;
  const details = facts.map((fact) => `${fact.name} costs ${formatPeso(fact.price)} (${fact.stock} in stock): ${fact.description}`);
  return [intro, ...details].join(' ');
}

/** Rule-based answer built only from catalog facts. Used directly and as the fallback for the AI draft. */
export function buildAssistantResponse(products, question) {
  const budget = parseBudget(question);
  const facts = selectCatalogFacts(products, question);
  if (facts.length === 0) return { answer: noMatchAnswer(budget), recommendedProducts: [], sources: [], mode: 'no-match' };
  return { answer: ruleAnswer(facts, budget), ...toResponseProducts(facts), mode: 'rules' };
}

const draftSchema = z.object({
  answer: z.string().trim().min(1).max(600),
  productIds: z.array(z.number().int().positive()).min(1).max(MAX_FACTS)
});

const MONEY_PATTERNS = [
  /(?:₱|\bphp\s?|\bp(?=\d))\s?(\d[\d,]*(?:\.\d+)?)/gi,
  /(\d[\d,]*(?:\.\d+)?)\s*(?:pesos?|php)\b/gi
];
const STOCK_COUNT_PATTERN = /\b(\d+)\s*(?:units?|pieces?|pcs|items?)?\s*(?:in stock|left|available|remaining)\b/gi;
const UNAVAILABLE_PATTERN = /\b(out of stock|sold out|unavailable|not available|isn't available|not in stock|no stock|no longer (?:sold|available))\b/i;

function amountsIn(text) {
  return MONEY_PATTERNS.flatMap((pattern) => [...text.matchAll(pattern)].map((match) => Number(match[1].replaceAll(',', ''))));
}

/**
 * Checks a provider draft against the facts selected for this request.
 * The draft is never trusted: ids, prices and availability claims must all match current catalog data.
 */
export function verifyDraft(draft, facts, budget = null) {
  const parsed = draftSchema.safeParse(draft);
  if (!parsed.success) return { ok: false, reason: 'INVALID_DRAFT_FORMAT' };
  const { answer } = parsed.data;
  const productIds = [...new Set(parsed.data.productIds)];
  const factsById = new Map(facts.map((fact) => [fact.id, fact]));

  if (productIds.some((id) => !factsById.has(id))) return { ok: false, reason: 'UNKNOWN_PRODUCT_ID' };

  const allowedAmounts = facts.map((fact) => fact.price);
  if (budget !== null) allowedAmounts.push(budget);
  const unsupportedAmount = amountsIn(answer).find((amount) => !allowedAmounts.some((allowed) => Math.abs(allowed - amount) < 0.005));
  if (unsupportedAmount !== undefined) return { ok: false, reason: 'UNSUPPORTED_PRICE' };

  if (UNAVAILABLE_PATTERN.test(answer)) return { ok: false, reason: 'UNSUPPORTED_AVAILABILITY' };
  const stockCounts = facts.map((fact) => fact.stock);
  const badCount = [...answer.matchAll(STOCK_COUNT_PATTERN)].some((match) => !stockCounts.includes(Number(match[1])));
  if (badCount) return { ok: false, reason: 'UNSUPPORTED_AVAILABILITY' };

  return { ok: true, answer, productIds };
}

const NOTICES = {
  NOT_CONFIGURED: 'AI drafting is not configured, so this answer was written by ShopSmart\'s catalog rules.',
  PROVIDER_RATE_LIMITED: 'The AI writer is busy right now (rate limit reached), so this answer was written by ShopSmart\'s catalog rules.',
  PROVIDER_TIMEOUT: 'The AI writer took too long to respond, so this answer was written by ShopSmart\'s catalog rules.',
  PROVIDER_ERROR: 'The AI writer is unavailable right now, so this answer was written by ShopSmart\'s catalog rules.',
  DRAFT_REJECTED: 'The AI draft did not pass ShopSmart\'s catalog checks, so this answer was written by ShopSmart\'s catalog rules.'
};

// Logs only the reason code and ProviderError's own fixed message (e.g. an HTTP status), never keys or provider bodies.
function fallback(facts, budget, reason, notice, logger, detail = '') {
  if (reason !== 'NOT_CONFIGURED') logger?.warn?.(`[assistant] fallback: ${reason}${detail ? ` (${detail})` : ''}`);
  return { answer: ruleAnswer(facts, budget), ...toResponseProducts(facts), mode: 'rules', notice, fallbackReason: reason };
}

/**
 * Retrieval first, then an optional AI draft, then verification.
 * recommendedProducts and sources always come from the selected catalog facts, never from model text.
 */
export async function answerQuestion(products, question, { provider = null, logger = console } = {}) {
  const budget = parseBudget(question);
  const facts = selectCatalogFacts(products, question);
  if (facts.length === 0) return { answer: noMatchAnswer(budget), recommendedProducts: [], sources: [], mode: 'no-match' };
  if (!provider) return fallback(facts, budget, 'NOT_CONFIGURED', NOTICES.NOT_CONFIGURED, logger);

  let draft;
  try {
    draft = await provider.draftAnswer({ question, facts });
  } catch (error) {
    const code = typeof error?.code === 'string' && error.code.startsWith('PROVIDER_') ? error.code : 'PROVIDER_UNAVAILABLE';
    const detail = error?.name === 'ProviderError' ? error.message : '';
    return fallback(facts, budget, code, NOTICES[code] || NOTICES.PROVIDER_ERROR, logger, detail);
  }

  const verified = verifyDraft(draft, facts, budget);
  if (!verified.ok) return fallback(facts, budget, verified.reason, NOTICES.DRAFT_REJECTED, logger);

  const chosen = verified.productIds.map((id) => facts.find((fact) => fact.id === id));
  return { answer: verified.answer, ...toResponseProducts(chosen), mode: 'ai' };
}
