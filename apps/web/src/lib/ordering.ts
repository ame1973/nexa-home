import { api, ApiError, type Service } from './api/client';

export const categoryIds = (services: Service[], categoryId: string | null) => services.filter((service) => service.categoryId === categoryId).map((service) => service.id);
export function moveId(ids: string[], from: string, to: string): string[] {
  const result = [...ids];
  const source = result.indexOf(from), target = result.indexOf(to);
  if (source < 0 || target < 0) return result;
  result.splice(source, 1);result.splice(target, 0, from);return result;
}

// Both exact scopes are attempted and partial failures are exposed to the UI.
export async function finishCategoryMove(serviceId: string, source: string | null, target: string | null, beforeId?: string) {
  const services = await api.services();
  const moved = services.find((service) => service.id === serviceId);
  if (!moved || moved.categoryId !== target) throw new ApiError(409, 'CONFLICT');
  const targetIds = categoryIds(services, target).filter((id) => id !== serviceId);
  const before = beforeId ? targetIds.indexOf(beforeId) : -1;
  targetIds.splice(before < 0 ? targetIds.length : before, 0, serviceId);
  const requests = source === target ? [api.reorderServices(target, targetIds)] : [api.reorderServices(source, categoryIds(services, source)), api.reorderServices(target, targetIds)];
  const results = await Promise.allSettled(requests);
  if (results.some((result) => result.status === 'rejected')) throw new ApiError(409, 'ORDER_PARTIAL');
}
