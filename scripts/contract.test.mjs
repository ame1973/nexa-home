import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import YAML from 'yaml';

const spec = YAML.parse(await readFile(new URL('../api/openapi.yaml', import.meta.url), 'utf8'));

test('NH-023: all 32 operations have unique IDs and stable error responses', () => {
  const operations = Object.values(spec.paths).flatMap(Object.values);
  assert.equal(operations.length, 32);
  assert.equal(new Set(operations.map((operation) => operation.operationId)).size, 32);
  for (const operation of operations) {
    assert.ok(operation.responses['500']);
    if (operation.requestBody) assert.ok(operation.responses['413']);
    if (operation.security.length) assert.ok(operation.responses['401']);
  }
});

test('NH-004: authenticated mutations declare CSRF', () => {
  for (const path of Object.values(spec.paths)) {
    for (const [method, operation] of Object.entries(path)) {
      if (method === 'get' || operation.security.length === 0) continue;
      assert.ok(operation.parameters.some((parameter) => parameter.name === 'X-CSRF-Token' && parameter.required));
    }
  }
});

test('NH-023: embedded JSON is generated from the normative YAML', async () => {
  const embedded = JSON.parse(await readFile(new URL('../api/openapi.json', import.meta.url), 'utf8'));
  assert.deepEqual(embedded, spec);
});

test('mutations close nested backup objects and never accept response link IDs', () => {
  assert.equal(spec.components.schemas.ServiceLinkInput.additionalProperties, false);
  assert.equal(spec.components.schemas.Backup.additionalProperties, false);
  assert.equal(spec.components.schemas.Backup.properties.assets.items.additionalProperties, false);
  for (const name of ['Service', 'ServiceLink', 'Settings', 'Tag']) {
    assert.equal(spec.components.schemas[name].additionalProperties, false);
  }
});
