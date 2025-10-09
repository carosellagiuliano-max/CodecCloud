import { nanoid } from 'nanoid';
import { createTranslator } from 'next-intl';
import { routing } from './i18n/config';

export type Problem = {
  title: string;
  detail?: string;
  status: number;
  instance?: string;
};

export type ApiError = Error & { problem?: Problem };

async function parseResponse<T>(response: Response): Promise<T> {
  if (response.ok) {
    if (response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  }

  let problem: Problem | undefined;
  try {
    problem = (await response.json()) as Problem;
  } catch (error) {
    problem = {
      title: response.statusText,
      status: response.status
    };
  }

  const error = new Error(problem.title) as ApiError;
  error.problem = problem;
  throw error;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'https://api.codeccloud.local/v1';

export type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  searchParams?: URLSearchParams;
  body?: unknown;
  headers?: Record<string, string>;
  locale?: string;
  idempotency?: boolean;
  authenticated?: boolean;
};

async function request<T>(path: string, options: RequestOptions = {}) {
  const authenticated = options.authenticated ?? true;
  const search = options.searchParams ? `?${options.searchParams.toString()}` : '';
  const endpoint = authenticated
    ? `/api/internal/proxy${path}${search}`
    : (() => {
        const url = new URL(path, API_BASE);
        if (options.searchParams) {
          url.search = options.searchParams.toString();
        }
        return url.toString();
      })();

  const headers: Record<string, string> = {
    'Accept': 'application/json',
    ...options.headers
  };

  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  if (options.locale) {
    headers['Accept-Language'] = options.locale;
  }

  if (options.method && options.method !== 'GET' && options.idempotency !== false) {
    headers['Idempotency-Key'] = nanoid();
  }

  const response = await fetch(endpoint, {
    method: options.method ?? 'GET',
    headers,
    body: options.body && !(options.body instanceof FormData) ? JSON.stringify(options.body) : (options.body as BodyInit | undefined),
    cache: 'no-store',
    credentials: authenticated ? 'include' : 'omit'
  });

  return parseResponse<T>(response);
}

export type Service = {
  id: string;
  name: string;
  description: string;
  durationMinutes: number;
  priceCents: number;
  currency: string;
};

export type Booking = {
  id: string;
  status: 'pending' | 'confirmed' | 'cancelled';
  serviceId: string;
  start: string;
  end: string;
  staffId: string;
  customerName: string;
  customerEmail: string;
  notes?: string;
};

export type AvailabilitySlot = {
  start: string;
  end: string;
  staffId: string;
  serviceId: string;
};

export type StaffMember = {
  id: string;
  name: string;
  role: string;
  email: string;
  avatarUrl?: string;
  locale: string;
  workingHours: { day: string; start: string; end: string }[];
};

export type DashboardMetrics = {
  revenueCents: number;
  utilisation: number;
  satisfaction: number;
};

export const apiClient = {
  listServices: (locale?: string) => request<Service[]>('/services', { locale, authenticated: false }),
  listAvailability: (params: {
    serviceId: string;
    from: string;
    to: string;
    staffId?: string;
    locale?: string;
  }) => {
    const search = new URLSearchParams({
      serviceId: params.serviceId,
      from: params.from,
      to: params.to
    });
    if (params.staffId) {
      search.append('staffId', params.staffId);
    }
    return request<AvailabilitySlot[]>('/bookings/availability', {
      searchParams: search,
      locale: params.locale
    });
  },
  listBookings: (locale?: string) => request<Booking[]>('/bookings', { locale }),
  createBooking: (payload: Partial<Booking>, locale?: string) =>
    request<Booking>('/bookings', {
      method: 'POST',
      body: payload,
      locale,
      idempotency: true
    }),
  rescheduleBooking: (id: string, payload: { start: string; end: string }, locale?: string) =>
    request<Booking>(`/bookings/${id}/reschedule`, {
      method: 'POST',
      body: payload,
      locale,
      idempotency: true
    }),
  cancelBooking: (id: string, locale?: string) =>
    request<Booking>(`/bookings/${id}/cancel`, {
      method: 'POST',
      locale,
      idempotency: true
    }),
  listStaff: (locale?: string) => request<StaffMember[]>('/staff', { locale }),
  inviteStaff: (payload: { name: string; email: string; role: string }, locale?: string) =>
    request<StaffMember>('/staff/invite', {
      method: 'POST',
      body: payload,
      locale,
      idempotency: true
    }),
  getDashboardMetrics: (locale?: string) => request<DashboardMetrics>('/admin/dashboard', { locale })
};

export async function translateProblem(locale: string, problem: Problem) {
  const translator = await createTranslator({ locale: routing.defaultLocale, namespace: 'common' });
  const message = problem.detail ?? problem.title;
  if (!locale || locale === routing.defaultLocale) return message;
  try {
    const t = await createTranslator({ locale, namespace: 'common' });
    return t.raw('error') + ` (${message})`;
  } catch (error) {
    return message;
  }
}
