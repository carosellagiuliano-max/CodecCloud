#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const messagesDir = path.join(repoRoot, 'apps/web/messages');

async function readMessages(locale) {
  const file = path.join(messagesDir, `${locale}.json`);
  const content = await fs.readFile(file, 'utf8');
  return JSON.parse(content);
}

function collectKeys(prefix, value, map) {
  if (typeof value === 'string') {
    map.add(prefix);
    return;
  }

  if (typeof value === 'object' && value) {
    Object.entries(value).forEach(([key, child]) => {
      collectKeys(prefix ? `${prefix}.${key}` : key, child, map);
    });
  }
}

function compareKeys(locale, baseKeys, candidate) {
  const candidateKeys = new Set();
  collectKeys('', candidate, candidateKeys);

  const missing = [...baseKeys].filter((key) => !candidateKeys.has(key));
  const extra = [...candidateKeys].filter((key) => !baseKeys.has(key));

  if (missing.length || extra.length) {
    const error = [
      `Locale ${locale} has discrepancies:`,
      missing.length ? `  Missing keys: ${missing.join(', ')}` : '',
      extra.length ? `  Extra keys: ${extra.join(', ')}` : ''
    ]
      .filter(Boolean)
      .join('\n');
    throw new Error(error);
  }
}

async function main() {
  const locales = ['de-CH', 'fr-CH', 'it-CH', 'en-CH'];
  const baseLocale = 'de-CH';

  const baseMessages = await readMessages(baseLocale);
  const baseKeys = new Set();
  collectKeys('', baseMessages, baseKeys);

  for (const locale of locales.filter((loc) => loc !== baseLocale)) {
    const candidate = await readMessages(locale);
    compareKeys(locale, baseKeys, candidate);
  }

  console.log('All locale files share the same keys.');
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exitCode = 1;
});
