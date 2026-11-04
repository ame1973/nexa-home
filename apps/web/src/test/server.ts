import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { bootstrap } from './fixtures';

export const apiURL = (path: string) => `${window.location.origin}/api/v1${path}`;
export const denied = (status = 401, code = 'UNAUTHENTICATED') => HttpResponse.json({ error: { code, message: 'Request rejected', requestId: 'test-request' } }, { status });
export const server = setupServer(
  http.get(apiURL('/setup/status'), () => HttpResponse.json({ initialized: true })),
  http.get(apiURL('/public/bootstrap'), () => HttpResponse.json(bootstrap)),
  http.get(apiURL('/auth/me'), () => denied()),
  http.get(apiURL('/admin/categories'), () => HttpResponse.json(bootstrap.categories)),
  http.get(apiURL('/admin/tags'), () => HttpResponse.json(bootstrap.tags)),
  http.get(apiURL('/admin/settings'), () => HttpResponse.json(bootstrap.settings)),
  http.get(apiURL('/admin/services'), () => HttpResponse.json({ items: bootstrap.services, total: bootstrap.services.length, page: 1, pageSize: 200 })),
);
