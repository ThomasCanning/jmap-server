# Authentication

This document describes the authentication system for the JMAP Serverless application.

## Overview

The system uses **AWS Cognito** for authentication with support for both browser-based and API clients. It provides automatic token refresh, cookie-based session management, and graceful fallback between authentication methods.

## Authentication Methods

The system attempts authentication in this priority order:

### 1. Bearer Token (Primary)
**Cookie-based** for browsers:
- Access token in `HttpOnly`, `Secure`, `SameSite=Lax` cookie
- Automatically sent by browser on every request
- Short-lived (1 hour) for security

**Header-based** for API clients:
- Token in `Authorization: Bearer <token>` header
- Client manages token lifecycle

### 2. Basic Authentication (Fallback)
- Credentials in `Authorization: Basic <base64>` header
- Validated against Cognito User Pool
- Automatically sets cookies for subsequent requests
- Used to establish browser sessions

## Token Types

| Token | Lifetime | Storage | Purpose |
|-------|----------|---------|---------|
| Access Token | 1 hour | HttpOnly cookie | Authenticates API requests |
| Refresh Token | 30 days | HttpOnly cookie | Obtains new access tokens |

**Token Validation:**
- JWT signature verified against Cognito JWKS
- Issuer, client ID, and expiration checked
- Access tokens use `client_id` claim, ID tokens use `aud` claim

## Authentication Flow

### Browser Login (Basic Auth → Cookies)
1. Client sends `Authorization: Basic <credentials>`
2. Server validates against Cognito (`USER_PASSWORD_AUTH`)
3. Server returns 200 OK with `Set-Cookie` headers
4. Subsequent requests automatically include cookies

### Automatic Token Refresh
**Key feature:** When the access token expires, the server automatically refreshes it using the refresh token—**transparent to the client**.

1. Browser makes request (access token expired, not sent)
2. Server detects refresh token cookie
3. Server calls Cognito (`REFRESH_TOKEN_AUTH`)
4. Server sets new cookies and continues request
5. Client receives successful response (never saw an error)

### API Client Authentication
API clients send `Authorization: Bearer <token>` and manage their own token lifecycle (no automatic refresh for header-based auth).

## Implementation

### Middleware (`withAuth`)

All protected endpoints use the `withAuth` wrapper:

```typescript
import { createAuthHandler } from '../lib/auth'

export const jmapHandler = createAuthHandler(async (event, auth) => {
  // auth.claims contains verified JWT claims
  // auth.bearerToken contains the access token
  // Request is guaranteed authenticated
  
  return {
    statusCode: 200,
    body: JSON.stringify({ methodResponses: [] })
  }
})
```

### Authentication Priority

1. **Try Bearer token** (cookies or Authorization header)
   - Verify JWT signature and claims
   
2. **Auto-refresh** (if Bearer fails and refresh token present)
   - Detect refresh_token cookie (even if access_token expired)
   - Call Cognito to refresh
   - Set new cookies and continue request
   
3. **Try Basic auth** (if no valid Bearer token)
   - Only if Authorization header doesn't contain "Bearer"
   - Set cookies on success
   
4. **Return 401/403** (if all fail)
   - 403 for browser requests (has Origin header)
   - 401 for API requests

### Cookie Security

All cookies use these security attributes:
- `HttpOnly` — Prevents JavaScript access (XSS protection)
- `Secure` — HTTPS only (MITM protection)
- `SameSite=Lax` — CSRF protection
- `Path=/` — Available to all routes
- `Max-Age` — 3600s (access), 2592000s (refresh)

### CORS Configuration

- **Allowed Origins:** Configured domains only
- **Credentials:** Enabled (required for cookies)
- **Methods:** GET, POST, OPTIONS
- **Headers:** authorization, content-type

### HTTP Method Validation

Method restrictions enforced at **API Gateway level** (not Lambda):
- `GET /jmap/session`
- `POST /jmap`
- `POST /auth/logout`
- `GET /auth/token`

Invalid methods receive 403 from API Gateway.

## Security

### Token Lifetimes
- **Access Token (1 hour):** Matches Cognito default, balances security and UX
- **Refresh Token (30 days):** Long-lived for good UX, cookie-only
- **Automatic Refresh:** Extends sessions without storing credentials

### Browser vs API Behavior
**Browsers** (Origin header present):
- Return 403 instead of 401 (no browser auth prompt)
- Automatic cookie management
- Automatic token refresh

**API Clients** (no Origin header):
- Return 401 for unauthorized
- Manual token management
- No automatic refresh

## Error Handling

| Scenario | Status | Message | Action |
|----------|--------|---------|--------|
| No credentials | 401/403 | Missing Basic auth | Authenticate |
| Invalid credentials | 401 | Invalid credentials | Check credentials |
| Expired token (no refresh) | 401/403 | Invalid token | Re-authenticate |
| Expired token (with refresh) | 200 | (transparent) | Auto-refreshed |
| Invalid refresh token | 401/403 | Invalid or expired refresh token | Re-authenticate |

All errors return JSON: `{ "error": "message" }`

## Environment Variables

- `USER_POOL_CLIENT_ID` — Cognito User Pool Client ID
- `AWS_REGION` — AWS region

Set automatically by SAM from CloudFormation outputs.

## Testing

### Unit Tests
Comprehensive test suite covers all authentication flows, token validation, automatic refresh, cookie management, and error scenarios.

```bash
npm test
```

### Manual Testing

**Basic Auth:**
```bash
curl -u "user@example.com:password" \
  https://jmap.example.com/jmap/session
```

**Bearer Token:**
```bash
curl -H "Authorization: Bearer <token>" \
  https://jmap.example.com/jmap \
  -d '{"methodCalls":[]}'
```

**Cookie-based Auth with Refresh:**
1. Login via browser to get cookies
2. Wait 60+ minutes for access token to expire
3. Make another request
4. Observe: Request succeeds (token auto-refreshed)

## Logout

Logout clears authentication cookies:

```
POST /auth/logout

Response: 204 No Content
Set-Cookie: access_token=deleted; Max-Age=0
Set-Cookie: refresh_token=deleted; Max-Age=0
```

## References

- [AWS Cognito User Pools](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-identity-pools.html)
- [JWT Best Practices](https://datatracker.ietf.org/doc/html/rfc8725)
- [HTTP Authentication](https://www.iana.org/assignments/http-authschemes/http-authschemes.xhtml)
