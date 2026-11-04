import { expect, it } from 'vitest';
import { filterServices, highlightParts, searchIndex } from './search';
import { bootstrap, fixtureServices } from '@/test/fixtures';

it('matches Unicode names, descriptions, categories and tags without requests', () => {
  const index = searchIndex(bootstrap);
  expect(filterServices(index, '  SYNOLOGY  ')).toHaveLength(1);
  expect(filterServices(index, '　相片　')).toHaveLength(1);
  expect(filterServices(index, 'MEDIA').length).toBeGreaterThan(0);
  expect(filterServices(index, 'Family')).toHaveLength(6);
  expect(filterServices(index, 'missing')).toHaveLength(0);
  expect(filterServices(index, '')).toEqual(bootstrap.services);
});
it('treats query metacharacters as literal text and highlights without HTML', () => {
  const index = searchIndex({ ...bootstrap, services: [{ ...bootstrap.services[0]!, name: '<script> [a.*] 日本語' }] });
  expect(filterServices(index, '[a.*]')).toHaveLength(1);expect(filterServices(index, '.*')).toHaveLength(1);
  expect(highlightParts('<script> [a.*] 日本語', '[a.*]')).toEqual([{ value: '<script> ', match: false }, { value: '[a.*]', match: true }, { value: ' 日本語', match: false }]);
});
it('filters a deterministic 1000-service fixture', () => {
  const services = fixtureServices(1000);const index = searchIndex({ ...bootstrap, services });
  expect(filterServices(index, 'Service 1000')).toHaveLength(1);
  expect(filterServices(index, 'Family')).toHaveLength(1000);
});
