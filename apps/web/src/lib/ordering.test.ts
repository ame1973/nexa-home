import { expect, it, vi } from 'vitest';
import { api, ApiError } from './api/client';
import { categoryIds, finishCategoryMove, moveId } from './ordering';
import { fixtureId, fixtureServices } from '@/test/fixtures';

it('keeps complete scopes, including hidden services', () => {
  const services = fixtureServices(4);services[1]!.isVisible = false;
  expect(categoryIds(services, fixtureId(2))).toContain(services[1]!.id);
  expect(moveId(['a', 'b', 'c'], 'a', 'c')).toEqual(['b', 'c', 'a']);
  expect(moveId(['a'], 'missing', 'a')).toEqual(['a']);
});
it('attempts both scopes and exposes partial movement failure', async () => {
  const services = fixtureServices(3);const moved = services[0]!;moved.categoryId = fixtureId(2);
  vi.spyOn(api, 'services').mockResolvedValue(services);
  const reorder = vi.spyOn(api, 'reorderServices').mockResolvedValue(undefined);
  reorder.mockRejectedValueOnce(new ApiError(409, 'CONFLICT'));
  await expect(finishCategoryMove(moved.id, fixtureId(1), fixtureId(2))).rejects.toMatchObject({ code: 'ORDER_PARTIAL' });
  expect(reorder).toHaveBeenCalledTimes(2);expect(reorder).toHaveBeenCalledWith(fixtureId(2), [services[1]!.id, moved.id]);
});
it('does not race two writes when source and target are the same', async () => {
  const services = fixtureServices(3);vi.spyOn(api, 'services').mockResolvedValue(services);
  const reorder = vi.spyOn(api, 'reorderServices').mockResolvedValue(undefined);
  await finishCategoryMove(services[0]!.id, fixtureId(1), fixtureId(1));expect(reorder).toHaveBeenCalledTimes(1);
});
