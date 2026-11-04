import type { Bootstrap, Service } from './api/client';

export function searchIndex(data: Pick<Bootstrap, 'services' | 'categories' | 'tags'>) {
  const categories = new Map(data.categories.map((category) => [category.id, category.name]));
  const tags = new Map(data.tags.map((tag) => [tag.id, tag.name]));
  return data.services.map((service) => ({
    service,
    text: [service.name, service.description, service.categoryId ? categories.get(service.categoryId) : '', ...service.tagIds.map((id) => tags.get(id))].filter(Boolean).join('\n'),
  }));
}
export function literalSearch(query: string): RegExp | null {
  const term = query.trim();
  return term ? new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'iu') : null;
}
export function filterServices(index: ReturnType<typeof searchIndex>, query: string): Service[] {
  const expression = literalSearch(query);
  return index.filter(({ text }) => !expression || expression.test(text)).map(({ service }) => service);
}
export function highlightParts(value: string, query: string): { value: string; match: boolean }[] {
  const expression = literalSearch(query);
  if (!expression) return [{ value, match: false }];
  const global = new RegExp(expression.source, 'giu');
  const parts: { value: string; match: boolean }[] = [];
  let position = 0;
  for (const match of value.matchAll(global)) {
    const start = match.index;
    if (start > position) parts.push({ value: value.slice(position, start), match: false });
    parts.push({ value: match[0], match: true });
    position = start + match[0].length;
  }
  if (position < value.length) parts.push({ value: value.slice(position), match: false });
  return parts;
}
