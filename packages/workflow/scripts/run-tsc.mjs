import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

if (!process.argv.includes('--noEmit')) {
  rmSync(fileURLToPath(new URL('../dist', import.meta.url)), { recursive: true, force: true });
}

await import('typescript/lib/tsc.js');
