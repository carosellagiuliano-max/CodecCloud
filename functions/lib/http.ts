import type { ZodSchema } from 'zod';
import { authenticateRequest, type AuthContext } from './auth';
import { respond, toProblem, ValidationProblem, type HttpResponse } from './errors';

export interface ApiRequest {
  method: string;
  headers: Record<string, string | undefined>;
  body?: unknown;
  query?: Record<string, string | undefined>;
  params?: Record<string, string | undefined>;
  /**
   * Connection source IP as provided by the hosting runtime.
   * Do not populate this field from user-controlled headers.
   */
  ip?: string;
}

export type AuthedHandler = (req: ApiRequest, auth: AuthContext) => Promise<HttpResponse>;

export const withAuth = (handler: AuthedHandler) => async (req: ApiRequest): Promise<HttpResponse> => {
  try {
    const auth = authenticateRequest(req.headers);
    return await handler(req, auth);
  } catch (error) {
    return toProblem(error, req.headers['x-request-id']);
  }
};

export const withoutAuth = (
  handler: (req: ApiRequest) => Promise<HttpResponse>
) => async (req: ApiRequest): Promise<HttpResponse> => {
  try {
    return await handler(req);
  } catch (error) {
    return toProblem(error, req.headers['x-request-id']);
  }
};

export const parseJson = <T>(schema: ZodSchema<T>, payload: unknown): T => {
  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new ValidationProblem(result.error);
  }
  return result.data;
};

export { respond } from './errors';
