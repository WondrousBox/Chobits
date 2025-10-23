import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './electron/main/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  strict: true,
  verbose: true
});
