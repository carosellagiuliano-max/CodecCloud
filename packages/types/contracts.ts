import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { OpenAPIObject, SchemaObject } from 'openapi3-ts/oas31';

const isoDateTime = () =>
  z
    .string()
    .datetime({ offset: true })
    .describe('ISO-8601 timestamp in UTC (e.g. 2025-01-01T09:00:00Z)');

const uuid = () => z.string().uuid().describe('UUID v4');

export const ProblemDetailSchema = z.object({
  type: z.string().url().describe('Problem type URI.'),
  title: z.string().describe('Short, human readable summary of the problem.'),
  status: z.number().int().describe('HTTP status code.'),
  detail: z.string().optional().describe('Detailed human readable explanation.'),
  instance: z.string().optional().describe('URI that identifies the specific occurrence.'),
  requestId: z.string().optional().describe('Correlating X-Request-ID header.'),
  errors: z
    .array(
      z.object({
        field: z.string().describe('Field path that caused the validation error.'),
        message: z.string().describe('Validation message.')
      })
    )
    .optional()
    .describe('Field level validation issues.')
});

export type ProblemDetail = z.infer<typeof ProblemDetailSchema>;

export const MoneySchema = z.object({
  currency: z.enum(['CHF', 'EUR']).describe('ISO-4217 currency code.'),
  amount: z.number().int().describe('Amount in the smallest currency unit (e.g. Rappen/Cents).')
});

export const BookingStatusSchema = z
  .enum(['scheduled', 'rescheduled', 'cancelled'])
  .describe('Lifecycle status of the booking.');

export const CustomerSchema = z.object({
  id: uuid().describe('Customer identifier (tenant scoped).'),
  email: z.string().email().describe('Customer contact email address.'),
  phone: z.string().optional().describe('Customer phone number in E.164 format.'),
  firstName: z.string().describe('Customer given name.'),
  lastName: z.string().describe('Customer family name.')
});

export const BookingSchema = z.object({
  id: uuid().describe('Booking identifier.'),
  tenantId: uuid().describe('Tenant identifier.'),
  serviceId: uuid().describe('Service identifier.'),
  staffId: uuid().describe('Staff member responsible for the booking.'),
  customer: CustomerSchema.describe('Customer reference.'),
  slotStart: isoDateTime().describe('Start of the booked slot.'),
  slotEnd: isoDateTime().describe('End of the booked slot.'),
  status: BookingStatusSchema,
  price: MoneySchema.describe('Price snapshot applied to the booking.'),
  createdAt: isoDateTime().describe('Creation timestamp.'),
  updatedAt: isoDateTime().describe('Last modification timestamp.'),
  rescheduledFromId: uuid().nullable().describe('Original booking identifier if rescheduled.'),
  cancellationReason: z
    .string()
    .nullable()
    .describe('Optional reason supplied when the booking was cancelled.')
});

export type Booking = z.infer<typeof BookingSchema>;

export const AvailabilitySlotSchema = z.object({
  slotStart: isoDateTime(),
  slotEnd: isoDateTime(),
  serviceId: uuid(),
  staffId: uuid()
});

export const GetAvailabilityQuerySchema = z.object({
  serviceId: uuid().describe('Service to query availability for.'),
  staffId: uuid().optional().describe('Optional staff filter.'),
  from: isoDateTime().describe('Inclusive lower bound of the availability range.'),
  to: isoDateTime().describe('Exclusive upper bound of the availability range.'),
  granularityMinutes: z
    .number()
    .int()
    .positive()
    .max(480)
    .default(15)
    .describe('Slot granularity in minutes (default 15).')
});

export const GetAvailabilityResponseSchema = z.object({
  slots: z.array(AvailabilitySlotSchema).describe('Available slots for the requested interval.')
});

export type GetAvailabilityResponse = z.infer<typeof GetAvailabilityResponseSchema>;

export const BookingCreateSchema = z.object({
  serviceId: uuid(),
  staffId: uuid(),
  slotStart: isoDateTime(),
  slotEnd: isoDateTime(),
  price: MoneySchema,
  customer: CustomerSchema,
  notes: z.string().max(2000).optional()
});

export const BookingCreateResponseSchema = z.object({
  booking: BookingSchema,
  outboxEventId: uuid().describe('Identifier of the enqueued outbox event for downstream systems.')
});

export type BookingCreateResponse = z.infer<typeof BookingCreateResponseSchema>;

export const BookingRescheduleSchema = z.object({
  bookingId: uuid(),
  slotStart: isoDateTime(),
  slotEnd: isoDateTime(),
  reason: z.string().max(2000).optional()
});

export const BookingRescheduleResponseSchema = z.object({
  booking: BookingSchema,
  outboxEventId: uuid()
});

export type BookingRescheduleResponse = z.infer<typeof BookingRescheduleResponseSchema>;

export const BookingCancelSchema = z.object({
  bookingId: uuid(),
  reason: z.string().max(2000).optional(),
  waiveFee: z.boolean().default(false)
});

export const BookingCancelResponseSchema = z.object({
  booking: BookingSchema,
  outboxEventId: uuid()
});

export type BookingCancelResponse = z.infer<typeof BookingCancelResponseSchema>;

export const StripeWebhookSchema = z.object({
  id: z.string(),
  type: z.string(),
  created: z.number(),
  data: z.record(z.any())
});

export const SumUpWebhookSchema = z.object({
  event_id: z.string(),
  event_type: z.string(),
  occurred_at: isoDateTime(),
  payload: z.record(z.any()),
  sequence: z.number().int().nonnegative()
});

export const InvoiceGenerateSchema = z.object({
  bookingId: uuid(),
  issueDate: isoDateTime(),
  dueDate: isoDateTime(),
  language: z.enum(['de-CH', 'fr-CH', 'it-CH', 'en-CH']).default('de-CH'),
  sendEmail: z.boolean().default(true)
});

export const InvoiceGenerateResponseSchema = z.object({
  invoiceId: uuid(),
  booking: BookingSchema,
  total: MoneySchema,
  pdfUrl: z.string().url(),
  outboxEventId: uuid()
});

export type InvoiceGenerateResponse = z.infer<typeof InvoiceGenerateResponseSchema>;

export const CalendarFeedQuerySchema = z.object({
  token: z.string().min(32).describe('HMAC signed feed token'),
  from: isoDateTime().optional(),
  to: isoDateTime().optional()
});

export const CalendarFeedResponseSchema = z.object({
  ics: z.string().describe('iCalendar payload containing upcoming appointments.')
});

export type CalendarFeedResponse = z.infer<typeof CalendarFeedResponseSchema>;

const schemaRegistry = {
  ProblemDetail: ProblemDetailSchema,
  Money: MoneySchema,
  BookingStatus: BookingStatusSchema,
  Customer: CustomerSchema,
  Booking: BookingSchema,
  AvailabilitySlot: AvailabilitySlotSchema,
  GetAvailabilityQuery: GetAvailabilityQuerySchema,
  GetAvailabilityResponse: GetAvailabilityResponseSchema,
  BookingCreate: BookingCreateSchema,
  BookingCreateResponse: BookingCreateResponseSchema,
  BookingReschedule: BookingRescheduleSchema,
  BookingRescheduleResponse: BookingRescheduleResponseSchema,
  BookingCancel: BookingCancelSchema,
  BookingCancelResponse: BookingCancelResponseSchema,
  StripeWebhook: StripeWebhookSchema,
  SumUpWebhook: SumUpWebhookSchema,
  InvoiceGenerate: InvoiceGenerateSchema,
  InvoiceGenerateResponse: InvoiceGenerateResponseSchema,
  CalendarFeedQuery: CalendarFeedQuerySchema,
  CalendarFeedResponse: CalendarFeedResponseSchema
} satisfies Record<string, z.ZodTypeAny>;

const convertSchemas = (): Record<string, SchemaObject> => {
  const result: Record<string, SchemaObject> = {};
  for (const [name, schema] of Object.entries(schemaRegistry)) {
    const jsonSchema = zodToJsonSchema(schema, {
      name,
      target: 'openApi3',
      $refStrategy: 'none'
    });
    const { $schema, ...rest } = jsonSchema;
    result[name] = rest as SchemaObject;
  }
  return result;
};

const jsonContent = (schemaRef: string) => ({
  'application/json': {
    schema: {
      $ref: schemaRef
    }
  }
});

const errorResponses = {
  '401': {
    description: 'Unauthenticated',
    content: jsonContent('#/components/schemas/ProblemDetail')
  },
  '403': {
    description: 'Forbidden',
    content: jsonContent('#/components/schemas/ProblemDetail')
  },
  '409': {
    description: 'Conflict',
    content: jsonContent('#/components/schemas/ProblemDetail')
  },
  '422': {
    description: 'Validation error',
    content: jsonContent('#/components/schemas/ProblemDetail')
  },
  '429': {
    description: 'Rate limited',
    content: jsonContent('#/components/schemas/ProblemDetail')
  },
  '500': {
    description: 'Unexpected error',
    content: jsonContent('#/components/schemas/ProblemDetail')
  }
};

const security = [{ BearerAuth: [], WorkspaceId: [] }];

export const openApiDocument: OpenAPIObject = {
  openapi: '3.1.0',
  info: {
    title: 'CodecCloud Salon API',
    version: '1.0.0',
    description:
      'Salon management API (MVP). Authentication via tenant scoped bearer tokens. All responses follow RFC 9457 (Problem Details) on error.'
  },
  servers: [
    {
      url: 'https://api.codeccloud.local/v1',
      description: 'Primary API endpoint (Edge).'
    }
  ],
  tags: [
    { name: 'Bookings', description: 'Booking lifecycle operations.' },
    { name: 'Payments', description: 'Incoming payment webhooks.' },
    { name: 'Invoices', description: 'Invoice generation.' },
    { name: 'Calendar', description: 'Calendar feed integration.' }
  ],
  paths: {
    '/bookings/availability': {
      get: {
        tags: ['Bookings'],
        summary: 'List available booking slots',
        description: 'Returns availability for a service (optionally filtered by staff) within the provided time range.',
        security,
        parameters: [
          {
            name: 'serviceId',
            in: 'query',
            required: true,
            schema: { type: 'string', format: 'uuid' }
          },
          {
            name: 'staffId',
            in: 'query',
            required: false,
            schema: { type: 'string', format: 'uuid' }
          },
          {
            name: 'from',
            in: 'query',
            required: true,
            schema: { type: 'string', format: 'date-time' }
          },
          {
            name: 'to',
            in: 'query',
            required: true,
            schema: { type: 'string', format: 'date-time' }
          },
          {
            name: 'granularityMinutes',
            in: 'query',
            required: false,
            schema: { type: 'integer', minimum: 1, maximum: 480 }
          }
        ],
        responses: {
          '200': {
            description: 'Availability returned successfully.',
            content: jsonContent('#/components/schemas/GetAvailabilityResponse')
          },
          ...errorResponses
        }
      }
    },
    '/bookings': {
      post: {
        tags: ['Bookings'],
        summary: 'Create a booking',
        description: 'Creates a booking atomically and enqueues an outbox event for downstream processing.',
        security,
        parameters: [
          {
            name: 'Idempotency-Key',
            in: 'header',
            required: true,
            schema: { type: 'string', minLength: 16 }
          }
        ],
        requestBody: {
          required: true,
          content: jsonContent('#/components/schemas/BookingCreate')
        },
        responses: {
          '201': {
            description: 'Booking created.',
            content: jsonContent('#/components/schemas/BookingCreateResponse')
          },
          ...errorResponses
        }
      }
    },
    '/bookings/{bookingId}/reschedule': {
      post: {
        tags: ['Bookings'],
        summary: 'Reschedule a booking',
        security,
        parameters: [
          {
            name: 'bookingId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' }
          },
          {
            name: 'Idempotency-Key',
            in: 'header',
            required: true,
            schema: { type: 'string', minLength: 16 }
          }
        ],
        requestBody: {
          required: true,
          content: jsonContent('#/components/schemas/BookingReschedule')
        },
        responses: {
          '200': {
            description: 'Booking rescheduled.',
            content: jsonContent('#/components/schemas/BookingRescheduleResponse')
          },
          ...errorResponses
        }
      }
    },
    '/bookings/{bookingId}/cancel': {
      post: {
        tags: ['Bookings'],
        summary: 'Cancel a booking',
        security,
        parameters: [
          {
            name: 'bookingId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' }
          },
          {
            name: 'Idempotency-Key',
            in: 'header',
            required: true,
            schema: { type: 'string', minLength: 16 }
          }
        ],
        requestBody: {
          required: true,
          content: jsonContent('#/components/schemas/BookingCancel')
        },
        responses: {
          '200': {
            description: 'Booking cancelled.',
            content: jsonContent('#/components/schemas/BookingCancelResponse')
          },
          ...errorResponses
        }
      }
    },
    '/payments/stripe/webhook': {
      post: {
        tags: ['Payments'],
        summary: 'Stripe webhook handler',
        security: [],
        requestBody: {
          required: true,
          content: jsonContent('#/components/schemas/StripeWebhook')
        },
        responses: {
          '200': {
            description: 'Event acknowledged.'
          },
          ...errorResponses
        }
      }
    },
    '/payments/sumup/webhook': {
      post: {
        tags: ['Payments'],
        summary: 'SumUp webhook handler',
        security: [],
        requestBody: {
          required: true,
          content: jsonContent('#/components/schemas/SumUpWebhook')
        },
        responses: {
          '200': {
            description: 'Event acknowledged.'
          },
          ...errorResponses
        }
      }
    },
    '/invoices/generate': {
      post: {
        tags: ['Invoices'],
        summary: 'Generate an invoice PDF',
        security,
        parameters: [
          {
            name: 'Idempotency-Key',
            in: 'header',
            required: true,
            schema: { type: 'string', minLength: 16 }
          }
        ],
        requestBody: {
          required: true,
          content: jsonContent('#/components/schemas/InvoiceGenerate')
        },
        responses: {
          '201': {
            description: 'Invoice generated.',
            content: jsonContent('#/components/schemas/InvoiceGenerateResponse')
          },
          ...errorResponses
        }
      }
    },
    '/calendar/feed.ics': {
      get: {
        tags: ['Calendar'],
        summary: 'ICS calendar feed',
        description: 'Edge endpoint returning an authenticated iCalendar feed.',
        security,
        parameters: [
          {
            name: 'token',
            in: 'query',
            required: true,
            schema: { type: 'string', minLength: 32 }
          },
          {
            name: 'from',
            in: 'query',
            required: false,
            schema: { type: 'string', format: 'date-time' }
          },
          {
            name: 'to',
            in: 'query',
            required: false,
            schema: { type: 'string', format: 'date-time' }
          }
        ],
        responses: {
          '200': {
            description: 'ICS feed returned.',
            content: {
              'text/calendar': {
                schema: {
                  type: 'string'
                }
              }
            }
          },
          ...errorResponses
        }
      }
    }
  },
  components: {
    schemas: convertSchemas(),
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT'
      },
      WorkspaceId: {
        type: 'apiKey',
        in: 'header',
        name: 'X-Workspace-ID'
      }
    }
  }
};

export type ApiOpenAPIDocument = typeof openApiDocument;

export const schemaNames = Object.keys(schemaRegistry);
