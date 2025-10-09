import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openApiDocument } from '../packages/types/contracts';

const currentDir = dirname(fileURLToPath(import.meta.url));
const targetPath = join(currentDir, '..', 'public', 'api', 'openapi.json');

await writeFile(targetPath, JSON.stringify(openApiDocument, null, 2));
console.log(`OpenAPI document generated at ${targetPath}`);
