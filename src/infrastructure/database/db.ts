/**
 * Database connection — singleton usando postgres.js + Drizzle ORM.
 *
 * Importe `db` em qualquer arquivo do servidor:
 *   import { db } from '../infrastructure/database/db';
 */
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    'DATABASE_URL não encontrada. Copie .env.example para .env e configure a variável.',
  );
}

// postgres.js connection — max 10 conexões por default (adequado para dev)
const queryClient = postgres(url);

export const db = drizzle(queryClient, { schema });
