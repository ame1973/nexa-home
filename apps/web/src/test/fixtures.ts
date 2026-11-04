import type { Bootstrap, Category, Service, Settings, Tag } from '@/lib/api/client';

export const fixtureId = (index: number) => `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`;
export const stamp = '2026-01-01T00:00:00.000000000Z';
export const settings: Settings = { siteTitle: 'Nexa Home', siteSubtitle: 'Everything you need, one place.', accessMode: 'public', theme: 'dark', accent: '#8B9FFF', cardDensity: 'comfortable', glassEnabled: true, revision: 1, updatedAt: stamp };
export const categories: Category[] = [
  { id: fixtureId(1), name: 'Media', description: '', icon: 'images', isVisible: true, position: 0, createdAt: stamp, updatedAt: stamp },
  { id: fixtureId(2), name: 'Workspace', description: '', icon: 'archive', isVisible: true, position: 1, createdAt: stamp, updatedAt: stamp },
];
export const tags: Tag[] = [{ id: fixtureId(10), name: 'Family', createdAt: stamp }];
export function fixtureServices(count = 6): Service[] {
  const names = ['Synology Photos', 'Jellyfin', 'Immich', 'Paperless', 'Home Assistant', 'AdGuard'];
  return Array.from({ length: count }, (_, index) => ({
    id: fixtureId(index + 100), name: names[index] ?? `Service ${index + 1}`, description: index === 0 ? '家庭相片與回憶' : 'A self-hosted service',
    categoryId: index % 3 === 2 ? null : fixtureId(index % 2 + 1), iconKind: 'lucide', iconValue: index % 2 ? 'server' : 'images', iconAssetId: null,
    color: '#405B82', openMode: 'new_tab', isFavorite: index < 2, isVisible: true, tagIds: [fixtureId(10)], position: index, createdAt: stamp, updatedAt: stamp,
    links: [{ id: fixtureId(index + 10000), label: 'primary', url: `https://service-${index + 1}.example.test` }],
  }));
}
export const bootstrap: Bootstrap = { settings, categories, tags, services: fixtureServices() };
export const csrf = 'A'.repeat(43);
