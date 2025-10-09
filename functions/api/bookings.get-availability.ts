import {
  GetAvailabilityQuerySchema,
  GetAvailabilityResponseSchema
} from '../../packages/types/contracts';
import { db } from '../lib/db';
import { parseJson, respond, type ApiRequest, withAuth } from '../lib/http';
import { rateLimiter } from '../lib/runtime';

const parseQuery = (req: ApiRequest) => {
  const query = {
    serviceId: req.query?.serviceId,
    staffId: req.query?.staffId,
    from: req.query?.from,
    to: req.query?.to,
    granularityMinutes: req.query?.granularityMinutes
      ? Number(req.query.granularityMinutes)
      : undefined
  };
  return parseJson(GetAvailabilityQuerySchema, query);
};

export const handler = withAuth(async (req, auth) => {
  await rateLimiter.consume(`availability:${auth.userId}`);
  const params = parseQuery(req);
  const slots = await db.listAvailability(auth.tenantId, {
    ...params,
    granularityMinutes: params.granularityMinutes ?? 15
  });
  const response = parseJson(GetAvailabilityResponseSchema, { slots });
  return respond(response, 200, { 'x-request-id': auth.requestId });
});
