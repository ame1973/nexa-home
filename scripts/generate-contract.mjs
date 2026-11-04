import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const root = new URL('../', import.meta.url);
const schema = YAML.parse(await readFile(new URL('api/openapi.yaml', root), 'utf8'));
await writeFile(new URL('api/openapi.json', root), `${JSON.stringify(schema, null, 2)}\n`);
console.log(`Generated ${fileURLToPath(new URL('api/openapi.json', root))}`);
