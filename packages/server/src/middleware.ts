import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  authenticateToken,
  authorize,
  extractTokenFromRequest,
  type AuthContext,
  type AuthUser,
} from './auth.js';

// ─── Permission Map ─────────────────────────────────────────────
// Declarative mapping: MCP action → required permission string.
// The middleware resolves which permission to check automatically,
// so handlers never import or call authorize() themselves.

export interface PermissionRule {
  permission: string;
  /** Optional sub-permission resolver for tools with internal actions */
  subPermission?: (args: Record<string, unknown>) => string | undefined;
}

/**
 * Declarative permission map for every guarded MCP endpoint.
 *
 * Keys follow the pattern:
 *   tool:<toolName>
 *   resource:<uri>
 *   prompt:<promptName>
 */
const PERMISSION_MAP: Record<string, PermissionRule> = {
  // ── Tools ──
  'tool:calculate': { permission: 'tools:calculate' },
  'tool:get_system_info': {
    permission: 'tools:get_system_info',
    subPermission: (args) =>
      args.detailed ? 'tools:get_system_info:detailed' : undefined,
  },
  'tool:manage_notes': {
    permission: 'tools:manage_notes',
    subPermission: (args) => {
      const action = args.action as string | undefined;
      return action ? `tools:manage_notes:${action}` : undefined;
    },
  },
  'tool:weather_report': { permission: 'tools:weather_report' },

  // ── Resources ──
  'resource:system://info': { permission: 'resources:system://info' },
  'resource:notes://all': { permission: 'resources:notes://all' },
  'resource:config://server': { permission: 'resources:config://server' },

  // ── Prompts ──
  'prompt:system_diagnostics': { permission: 'prompts:system_diagnostics' },
  'prompt:summarize_notes': { permission: 'prompts:summarize_notes' },
};

// ─── AuthMiddleware class ───────────────────────────────────────

export class AuthMiddleware {
  private user: AuthUser | undefined;

  constructor(user?: AuthUser) {
    this.user = user;
  }

  /** The authenticated user (may be undefined for anonymous sessions). */
  getUser(): AuthUser | undefined {
    return this.user;
  }

  /**
   * Run an authorization check and throw if denied.
   *
   * @param kind   - 'tool' | 'resource' | 'prompt'
   * @param name   - The tool name, resource URI, or prompt name
   * @param args   - Optional arguments (used for sub-permission resolution)
   */
  enforce(
    kind: 'tool' | 'resource' | 'prompt',
    name: string,
    args?: Record<string, unknown>
  ): void {
    const key = `${kind}:${name}`;
    const rule = PERMISSION_MAP[key];

    if (!rule) {
      // No explicit rule → allow (open by default for unregistered endpoints).
      return;
    }

    // 1. Check top-level permission
    const topLevel = authorize(this.user, rule.permission);
    if (!topLevel.allowed) {
      throw new AuthorizationError(
        topLevel.reason ??
          `Forbidden: Access to ${kind} '${name}' denied for role '${this.user?.role ?? 'anonymous'}'.`
      );
    }

    // 2. Check sub-permission if the rule defines one
    if (rule.subPermission && args) {
      const sub = rule.subPermission(args);
      if (sub) {
        const subResult = authorize(this.user, sub);
        if (!subResult.allowed) {
          throw new AuthorizationError(
            subResult.reason ??
              `Forbidden: Sub-action '${sub}' on ${kind} '${name}' denied for role '${this.user?.role ?? 'anonymous'}'.`
          );
        }
      }
    }
  }

  /**
   * Non-throwing variant — returns `{ allowed, reason }` instead of throwing.
   */
  check(
    kind: 'tool' | 'resource' | 'prompt',
    name: string,
    args?: Record<string, unknown>
  ): { allowed: boolean; reason?: string } {
    try {
      this.enforce(kind, name, args);
      return { allowed: true };
    } catch (err) {
      if (err instanceof AuthorizationError) {
        return { allowed: false, reason: err.message };
      }
      throw err;
    }
  }
}

// ─── AuthorizationError ────────────────────────────────────────

export class AuthorizationError extends Error {
  public readonly statusCode = 403;
  constructor(message: string) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

// ─── HTTP Middleware helpers ────────────────────────────────────

/**
 * Express/http-style middleware that authenticates an HTTP request
 * and attaches `req.authContext` and `req.authMiddleware`.
 *
 * Returns `true` if the request is authenticated and may proceed,
 * or `false` if a 401 response was already sent.
 */
export function httpAuthMiddleware(
  req: IncomingMessage & { authContext?: AuthContext; authMiddleware?: AuthMiddleware },
  res: ServerResponse
): boolean {
  const token = extractTokenFromRequest(req);
  const authResult = authenticateToken(token);

  if (!authResult.authenticated || !authResult.user) {
    console.warn(
      `[auth-middleware] 401 Unauthorized from ${req.socket.remoteAddress}: ${authResult.error}`
    );
    res.writeHead(401, {
      'Content-Type': 'application/json',
      'WWW-Authenticate': 'Bearer realm="mcp-server"',
    }).end(
      JSON.stringify({
        error: 'Unauthorized',
        message: authResult.error || 'Valid authentication token required.',
      })
    );
    return false;
  }

  req.authContext = authResult;
  req.authMiddleware = new AuthMiddleware(authResult.user);

  console.log(
    `[auth-middleware] ✓ ${authResult.user.username} (${authResult.user.role}) authenticated`
  );
  return true;
}

/**
 * Create an AuthMiddleware for a Stdio session using an env-based token.
 */
export function createStdioAuthMiddleware(): AuthMiddleware {
  const token =
    process.env.MCP_AUTH_TOKEN ||
    process.env.MCP_ADMIN_TOKEN ||
    'admin-token-secret-123';
  const auth = authenticateToken(token);
  return new AuthMiddleware(auth.authenticated ? auth.user : undefined);
}
