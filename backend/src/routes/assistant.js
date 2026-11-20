import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { prisma } from '../lib/prisma.js';
import { createProviderFromEnv, splitMockDirective } from '../services/aiProvider.js';
import { answerQuestion } from '../services/assistant.js';
import { assistantQuestionSchema } from '../validators/schemas.js';

// Only public catalog fields are loaded; out-of-stock and inactive products never reach the assistant.
const CATALOG_FACT_FIELDS = { id: true, name: true, description: true, category: true, price: true, stock: true };

export function createAssistantRouter({ db = prisma, provider = createProviderFromEnv(process.env), logger = console } = {}) {
  const router = Router();
  const assistantLimiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false });

  router.post('/questions', assistantLimiter, async (request, response, next) => {
    try {
      const parsed = assistantQuestionSchema.safeParse(request.body);
      if (!parsed.success) return response.status(422).json({ error: { code: 'INVALID_QUESTION', message: 'Question must contain between 3 and 300 characters.' } });
      const products = await db.product.findMany({
        where: { active: true, stock: { gt: 0 } },
        select: CATALOG_FACT_FIELDS,
        orderBy: { price: 'asc' }
      });
      // Only the simulated provider honours "#simulate-<failure>" tags; with a live provider they are ordinary text.
      const { question, failure } = provider?.simulated ? splitMockDirective(parsed.data.question) : { question: parsed.data.question, failure: null };
      response.json(await answerQuestion(products, question, { provider, logger, failure }));
    } catch (error) { next(error); }
  });

  return router;
}

export default createAssistantRouter;
