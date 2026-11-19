import type { IncomingMessage } from 'node:http';

export type UserRole = 'admin' | 'user' | 'guest';

export interface AuthUser {
  id: string;
  username: string;
  role: UserRole;
  permissions: string[];
}

export interface AuthContext {
  authenticated: boolean;
  user?: AuthUser;
  token?: string;
  error?: string;
}

// In-memory token directory (can be overridden via environment variables)
export const TOKEN_REGISTRY: Record<string, AuthUser> = {
  [process.env.MCP_ADMIN_TOKEN || 'admin-token-secret-123']: {
    id: 'usr-admin-01',
    username: 'Alice (Administrator)',
    role: 'admin',
    permissions: [
      '*', // Full access
    ],
  },
  [process.env.MCP_USER_TOKEN || 'user-token-secret-456']: {
    id: 'usr-dev-02',
    username: 'Bob (Developer)',
    role: 'user',
    permissions: [
      'tools:calculate',
      'tools:weather_report',
      'tools:get_system_info',
      'tools:manage_notes:create',
      'tools:manage_notes:read',
      'tools:manage_notes:list',
      'resources:system://info',
      'resources:notes://all',
      'prompts:summarize_notes',
      'prompts:system_diagnostics',
    ],
  },
  [process.env.MCP_GUEST_TOKEN || 'guest-token-secret-789']: {
    id: 'usr-guest-03',
    username: 'Charlie (Guest)',
    role: 'guest',
    permissions: [
      'tools:calculate',
      'tools:weather_report',
      'tools:manage_notes:read',
      'tools:manage_notes:list',
      'resources:notes://all',
    ],
  },
};

/**
 * Validate token and return authenticated user context.
 */
export function authenticateToken(token?: string): AuthContext {
  if (!token) {
    return {
      authenticated: false,
      error: 'Authentication failed: No token provided.',
    };
  }

  const cleanToken = token.replace(/^Bearer\s+/i, '').trim();
  const user = TOKEN_REGISTRY[cleanToken];

  if (!user) {
    return {
      authenticated: false,
      error: `Authentication failed: Invalid token '${cleanToken.slice(0, 8)}...'.`,
    };
  }

  return {
    authenticated: true,
    user,
    token: cleanToken,
  };
}

/**
 * Extract token from HTTP Request headers or query string.
 */
export function extractTokenFromRequest(req: IncomingMessage): string | undefined {
  // 1. Check Authorization header: "Bearer <token>"
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }

  // 2. Check x-api-key header
  const apiKeyHeader = req.headers['x-api-key'];
  if (typeof apiKeyHeader === 'string' && apiKeyHeader.trim()) {
    return apiKeyHeader.trim();
  }

  // 3. Check URL query parameters (?token=... or ?apiKey=...)
  if (req.url) {
    const dummyHost = req.headers.host || 'localhost';
    try {
      const parsedUrl = new URL(req.url, `http://${dummyHost}`);
      const queryToken = parsedUrl.searchParams.get('token') || parsedUrl.searchParams.get('apiKey');
      if (queryToken) {
        return queryToken.trim();
      }
    } catch {
      // Ignore malformed URL
    }
  }

  return undefined;
}

/**
 * Check if the user has permission for a specific action or resource.
 */
export function authorize(
  user: AuthUser | undefined,
  requiredPermission: string
): { allowed: boolean; reason?: string } {
  if (!user) {
    return {
      allowed: false,
      reason: 'Unauthorized: Authentication required to perform this action.',
    };
  }

  // Admin wildcard check
  if (user.permissions.includes('*') || user.role === 'admin') {
    return { allowed: true };
  }

  // Direct permission check
  if (user.permissions.includes(requiredPermission)) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: `Forbidden: User '${user.username}' (role: ${user.role}) does not have required permission '${requiredPermission}'.`,
  };
}
