# Authentication

AWS Cognito-based authentication with automatic token refresh and cookie-based sessions.

## Authentication Methods

Authentication is attempted in this order:

### 1. Bearer Token (Primary)
- **Cookies** (browsers): `HttpOnly`, `Secure`, `SameSite=Lax` cookies
- **Header** (API clients): `Authorization: Bearer <token>`

### 2. Basic Authentication (Fallback)
- `Authorization: Basic <base64>` header
- Validates against Cognito and sets cookies on success

## Tokens

| Token | Lifetime | Storage |
|-------|----------|---------|
| Access Token | 1 hour | HttpOnly cookie |
| Refresh Token | 30 days | HttpOnly cookie |

**Validation:** JWT signature verified against Cognito JWKS. Issuer, client ID, and expiration validated.

## Authentication Flow

### Login Endpoints

**`POST /auth/login`** - Browser login (sets cookies)
- Accepts Basic auth or JSON body: `{"username": "...", "password": "..."}`
- Returns 200 with `Set-Cookie` headers
- Subsequent requests use cookies automatically

**`POST /auth/token`** - API client login (returns JSON)
- Same credentials as `/auth/login`
- Returns 200 with `{"accessToken": "...", "refreshToken": "..."}`
- Client manages token lifecycle

### Automatic Token Refresh

When access token expires, server automatically refreshes using refresh token cookie—**transparent to client**:
1. Request arrives with expired/missing access token
2. Server detects refresh token cookie
3. Server refreshes via Cognito
4. Server sets new cookies and continues request
5. Client receives successful response (no error seen)

**Note:** Automatic refresh only works with cookie-based auth. Header-based Bearer tokens require manual refresh.

## Implementation

Protected endpoints use `withAuth` middleware:

```typescript
import { withAuth } from '../lib/auth'

export const handler = withAuth(async (event, auth) => {
  // auth.claims - verified JWT claims
  // auth.bearerToken - access token
  // auth.username - extracted username
  return { statusCode: 200, body: '...' }
})
```

**Authentication Priority:**
1. Bearer token (cookies or header) → verify JWT
2. Auto-refresh (if Bearer fails + refresh token cookie present)
3. Basic auth (if no Bearer header)
4. 401 Unauthorized (if all fail)

### Security

**Cookies:** `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`

**CORS:** Configured origins only, credentials enabled

**Endpoints:**
- `GET /jmap/session`
- `POST /jmap`
- `POST /auth/login`
- `POST /auth/token`
- `POST /auth/logout`

## Error Handling

| Scenario | Status | Message |
|----------|--------|---------|
| No credentials | 401 | "No authentication method provided..." |
| Invalid credentials | 401 | "Invalid credentials" |
| Expired token (no refresh) | 401 | "Invalid token" |
| Expired token (with refresh) | 200 | (auto-refreshed, transparent) |
| Invalid refresh token | 401 | "Invalid or expired refresh token" |

All errors return JSON: `{ "error": "message" }`

## Environment Variables

- `USER_POOL_CLIENT_ID` - Cognito User Pool Client ID
- `API_URL` - Base API URL (for session endpoint)

Set automatically by SAM from CloudFormation outputs.

## Testing

**Basic Auth:**
```bash
curl -u "user@example.com:password" https://jmap.example.com/jmap/session
```

**Bearer Token:**
```bash
curl -H "Authorization: Bearer <token>" https://jmap.example.com/jmap \
  -d '{"methodCalls":[]}'
```

**Login (JSON):**
```bash
curl -X POST https://jmap.example.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"user@example.com","password":"password"}'
```

## Logout

`POST /auth/logout` - Revokes refresh token server-side and clears cookies

**Response:** 204 No Content with `Set-Cookie` headers clearing tokens
