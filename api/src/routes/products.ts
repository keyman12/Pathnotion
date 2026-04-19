import { Router } from 'express';
import { asc } from 'drizzle-orm';
import { db, schema } from '../db/client.js';

export const productsRouter = Router();

productsRouter.get('/', async (_req, res) => {
  const rows = await db.select().from(schema.products).orderBy(asc(schema.products.sortOrder));
  res.json(rows);
});
