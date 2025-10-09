import { createHmac } from 'node:crypto';
import { CalendarFeedQuerySchema } from '../../packages/types/contracts';
import { db, renderCalendarIcs } from '../lib/db';
import { withoutAuth, parseJson, type ApiRequest } from '../lib/http';
import { BadRequestError } from '../lib/errors';

const CALENDAR_SECRET = process.env.CALENDAR_FEED_SECRET ?? 'calendar_feed_secret';

const decodeToken = (token: string): string => {
  const [tenantId, signature] = token.split('.');
  if (!tenantId || !signature) {
    throw new BadRequestError('Invalid calendar token.');
  }
  const expected = createHmac('sha256', CALENDAR_SECRET).update(tenantId).digest('hex');
  if (expected !== signature) {
    throw new BadRequestError('Calendar token signature mismatch.');
  }
  return tenantId;
};

export const handler = withoutAuth(async (req: ApiRequest) => {
  const query = parseJson(CalendarFeedQuerySchema, {
    token: req.query?.token,
    from: req.query?.from,
    to: req.query?.to
  });

  const tenantId = decodeToken(query.token);
  const from = query.from ?? new Date().toISOString();
  const to = query.to ?? new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();
  const bookings = await db.listUpcomingBookings(tenantId, from, to);
  const ics = renderCalendarIcs(bookings);

  return {
    status: 200,
    headers: {
      'content-type': 'text/calendar; charset=utf-8'
    },
    body: ics
  };
});
