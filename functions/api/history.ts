import { handleRpc } from '../_lib/rpc';
import type { RequestContext } from '../_lib/http';

export function onRequest({ request }: RequestContext) {
  return handleRpc(request, 'history');
}
