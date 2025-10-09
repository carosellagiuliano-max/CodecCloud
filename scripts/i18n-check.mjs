#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = resolve(root, '.env.example');

const envContents = await readFile(envPath, 'utf8');

const readEnvValue = (name) => {
  const match = envContents.match(new RegExp(`^${name}=([^\n]*)`, 'm'));
  return match ? match[1].trim() : null;
};

const supportedValue = readEnvValue('NEXT_PUBLIC_I18N_SUPPORTED_LOCALES');
if (!supportedValue) {
  console.error('[i18n:check] NEXT_PUBLIC_I18N_SUPPORTED_LOCALES missing in .env.example');
  process.exit(1);
}

const locales = supportedValue
  .split(',')
  .map((locale) => locale.trim())
  .filter((locale) => locale.length > 0);

if (locales.length === 0) {
  console.error('[i18n:check] No locales configured in NEXT_PUBLIC_I18N_SUPPORTED_LOCALES');
  process.exit(1);
}

const duplicates = new Set();
const seen = new Set();
for (const locale of locales) {
  if (seen.has(locale)) {
    duplicates.add(locale);
  }
  seen.add(locale);
}

if (duplicates.size > 0) {
  console.error(`[i18n:check] Duplicate locale entries detected: ${Array.from(duplicates).join(', ')}`);
  process.exit(1);
}

const defaultLocale = readEnvValue('NEXT_PUBLIC_I18N_DEFAULT_LOCALE');
if (!defaultLocale) {
  console.error('[i18n:check] NEXT_PUBLIC_I18N_DEFAULT_LOCALE missing in .env.example');
  process.exit(1);
}

if (!locales.includes(defaultLocale)) {
  console.error(
    `[i18n:check] Default locale "${defaultLocale}" is not part of NEXT_PUBLIC_I18N_SUPPORTED_LOCALES (${locales.join(', ')})`
  );
  process.exit(1);
}

console.log(`[i18n:check] Default locale ${defaultLocale} validated. Supported locales: ${locales.join(', ')}`);
