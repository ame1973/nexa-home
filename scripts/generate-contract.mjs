import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import openapiTS, { astToString } from 'openapi-typescript';
import ts from 'typescript';

const root = new URL('../', import.meta.url);
const source = new URL('api/openapi.yaml', root);
const schema = YAML.parse(await readFile(source, 'utf8'));
await writeFile(new URL('api/openapi.json', root), `${JSON.stringify(schema, null, 2)}\n`);
const ast = await openapiTS(source, {
  transform(schemaObject) {
    if (schemaObject.format === 'binary') return ts.factory.createTypeReferenceNode('Blob');
  },
});
await writeFile(new URL('apps/web/src/lib/api/schema.d.ts', root), astToString(ast));
console.log(`Generated contract JSON and browser types from ${fileURLToPath(source)}`);
