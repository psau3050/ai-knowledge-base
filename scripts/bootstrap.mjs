// From a fresh clone to a runnable stack in one command:
//   pnpm bootstrap → check prerequisites → install → start Supabase + migrations → write .env
// Safe to re-run: every step is idempotent and values already in .env are kept.
import { execSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const envFile = resolve(root, '.env');

const run = (command) => execSync(command, { cwd: root, stdio: 'inherit' });
const capture = (command) =>
  execSync(command, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const step = (message) => console.log(`\n▸ ${message}`);
const fail = (message) => {
  console.error(`\n✖ ${message}`);
  process.exit(1);
};

step('Checking prerequisites');
const nodeMajor = Number(process.versions.node.split('.')[0]);
if (nodeMajor < 22) fail(`Node.js 22 or newer is required (found ${process.versions.node}).`);
try {
  capture('docker info');
} catch {
  fail(
    'Docker is not running. Start Docker Desktop (or another engine), then re-run `pnpm bootstrap`.',
  );
}

step('Installing dependencies');
run('pnpm install');

step('Starting Supabase (the first run downloads Docker images and takes a few minutes)');
run('pnpm exec supabase start');
// An already-running stack keeps its schema; apply any migrations it hasn't seen yet.
run('pnpm exec supabase migration up --local');

step('Writing .env');
if (!existsSync(envFile)) copyFileSync(resolve(root, '.env.example'), envFile);
const status = JSON.parse(capture('pnpm exec supabase status -o json'));
let env = readFileSync(envFile, 'utf8');
for (const [key, value] of Object.entries({
  SUPABASE_URL: status.API_URL,
  SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY ?? status.ANON_KEY,
})) {
  const line = new RegExp(`^${key}=.*$`, 'm');
  env = line.test(env)
    ? env.replace(line, `${key}=${value}`)
    : `${env.trimEnd()}\n${key}=${value}\n`;
}
writeFileSync(envFile, env);

const emptyKeys = ['AI_CHAT_API_KEY', 'AI_EMBED_API_KEY'].filter((key) =>
  new RegExp(`^${key}=\\s*$`, 'm').test(env),
);
console.log('\n✔ Supabase is running and .env is written.');
if (emptyKeys.length > 0) {
  console.log(
    `\n  Next: add your AI provider settings to .env (${emptyKeys.join(', ')} ${emptyKeys.length > 1 ? 'are' : 'is'} empty).` +
      '\n  See "Swapping AI providers" in README.md. A local Ollama needs no key.',
  );
}
console.log(
  '\n  Then: pnpm dev  →  web http://localhost:3000 · API http://localhost:4000 · Studio http://127.0.0.1:54323\n',
);
