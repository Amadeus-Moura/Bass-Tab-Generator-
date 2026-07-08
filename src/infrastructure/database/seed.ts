/**
 * Seed script — executa UMA VEZ após a migração inicial.
 *
 * Cria o "usuário fantasma" (dev@local.com) com UUID fixo para que todas
 * as músicas e tablaturas tenham uma FK válida enquanto não há autenticação.
 *
 * Uso:
 *   npm run db:seed
 */
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { db } from './db';
import { users, userPreferences } from './schema';

// UUID fixo e previsível — sincronizado com .env (MOCK_USER_ID)
const MOCK_USER_ID = process.env.MOCK_USER_ID ?? '00000000-0000-0000-0000-000000000001';

async function seed() {
  console.log('\n🌱  Bass Tab — Database Seed\n');

  // Idempotente: não duplica se rodar mais de uma vez
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, MOCK_USER_ID));

  if (existing.length > 0) {
    console.log('✅  Usuário mockado já existe — nada a fazer.');
    console.log(`    UUID: ${MOCK_USER_ID}`);
    return;
  }

  // Insere usuário e preferências em transação
  await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({
        id:          MOCK_USER_ID,
        email:       'dev@local.com',
        displayName: 'Dev User',
      })
      .returning();

    await tx.insert(userPreferences).values({
      userId:       user.id,
      defaultMode:  'frets',
      pxPerSecond:  160,
      tuningPreset: 'EADG',
    });

    console.log('✅  Usuário mockado criado com sucesso!');
    console.log(`    UUID:  ${user.id}`);
    console.log(`    Email: ${user.email}`);
  });

  console.log('\n💡  Adicione ao seu .env:');
  console.log(`    MOCK_USER_ID=${MOCK_USER_ID}`);
  console.log('\n    Este UUID é a FK obrigatória em songs e tags.\n');
}

seed()
  .catch((err) => {
    console.error('\n❌  Seed falhou:', err);
    process.exit(1);
  })
  .finally(() => process.exit(0));
