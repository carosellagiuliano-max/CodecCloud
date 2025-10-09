import { randomUUID } from 'node:crypto';
import { UnauthorizedError, ForbiddenError } from './errors';

export type HttpHeaders = Record<string, string | undefined>;

export type AuthToken = {
  token: string;
  tenantId: string;
  userId: string;
  roles: string[];
  scopes?: string[];
  suspended?: boolean;
};

export type AuthContext = {
  requestId: string;
  tenantId: string;
  userId: string;
  roles: string[];
  scopes: string[];
  workspaceId: string;
};

export class AuthService {
  private readonly tokens = new Map<string, AuthToken>();

  constructor(initialTokens: AuthToken[] = []) {
    for (const token of initialTokens) {
      this.registerToken(token);
    }
  }

  registerToken(token: AuthToken) {
    this.tokens.set(token.token, token);
  }

  revokeToken(token: string) {
    this.tokens.delete(token);
  }

  authenticate(headers: HttpHeaders): AuthContext {
    const requestId = headers['x-request-id'] ?? randomUUID();
    const authHeader = headers.authorization ?? headers.Authorization;
    if (!authHeader) {
      throw new UnauthorizedError('Missing Authorization header.');
    }

    const bearer = authHeader.split(' ');
    if (bearer.length !== 2 || bearer[0].toLowerCase() !== 'bearer') {
      throw new UnauthorizedError('Unsupported Authorization header format.');
    }

    const record = this.tokens.get(bearer[1]);
    if (!record || record.suspended) {
      throw new UnauthorizedError('Invalid or inactive access token.');
    }

    const workspaceId = headers['x-workspace-id'];
    if (!workspaceId) {
      throw new UnauthorizedError('X-Workspace-ID header missing.');
    }

    if (workspaceId !== record.tenantId) {
      throw new ForbiddenError('Token does not grant access to this workspace.');
    }

    return {
      requestId,
      tenantId: record.tenantId,
      userId: record.userId,
      roles: record.roles,
      scopes: record.scopes ?? [],
      workspaceId
    };
  }

  assertRole(context: AuthContext, role: string) {
    if (!context.roles.includes(role)) {
      throw new ForbiddenError(`Role ${role} is required.`);
    }
  }

  assertScope(context: AuthContext, scope: string) {
    if (!context.scopes.includes(scope)) {
      throw new ForbiddenError(`Scope ${scope} is required.`);
    }
  }
}

export const authService = new AuthService([
  {
    token: 'root-token',
    tenantId: '00000000-0000-0000-0000-000000000000',
    userId: '00000000-0000-0000-0000-000000000001',
    roles: ['owner'],
    scopes: ['bookings:write', 'bookings:read', 'payments:read', 'invoices:write']
  }
]);

export const authenticateRequest = (headers: HttpHeaders): AuthContext => authService.authenticate(headers);
