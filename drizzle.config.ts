import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './packages/common/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  strict: true,
  verbose: true
});
