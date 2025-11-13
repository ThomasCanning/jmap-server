# Client Configuration

This document describes how to configure various JMAP clients to work with this server.

## Overview

This server supports multiple clients (web, desktop, mobile) simultaneously. Each client type has different configuration requirements.

## Web Clients

### CORS Configuration

Web clients must have their origin added to the `ALLOWED_ORIGINS` configuration:

1. Edit `config.mk`:
```makefile
ALLOWED_ORIGINS = https://webclient1.com,https://webclient2.com,http://localhost:5173
```

2. Redeploy:
```bash
make deploy
```

### Authentication

Web clients can use:
- **Basic Auth** for initial login (sets cookies automatically)
- **Cookie-based sessions** with automatic token refresh
- **Bearer tokens** in Authorization header (if preferred)

See [AUTHENTICATION.md](AUTHENTICATION.md) for detailed authentication flows.

### Example Configuration

For a React web client:
```typescript
const JMAP_API_URL = 'https://jmap.yourdomain.com';
const JMAP_SESSION_URL = `${JMAP_API_URL}/jmap/session`;

// Initial login
fetch(`${JMAP_API_URL}/auth/token`, {
  method: 'GET',
  credentials: 'include', // Important: include cookies
  headers: {
    'Authorization': `Basic ${btoa('user@yourdomain.com:password')}`
  }
});

// Subsequent requests (cookies sent automatically)
fetch(JMAP_SESSION_URL, {
  credentials: 'include'
});
```

## Desktop/Mobile Clients

### Direct Connection

Configure clients to connect directly to:
```
https://jmap.yourdomain.com
```

### Autodiscovery

Clients can use autodiscovery with:
- **Email**: `user@yourdomain.com`
- Client will autodiscover via:
  1. SRV record: `_jmap._tcp.yourdomain.com`
  2. HTTP redirect: `https://yourdomain.com/.well-known/jmap`

### Authentication

Desktop/mobile clients should use:
- **Basic Auth** for initial authentication
- **Bearer tokens** for subsequent requests
- Clients must manage token refresh manually (no automatic refresh for header-based auth)

### Example Configuration

For a desktop client:
```bash
# Get access token
TOKEN=$(curl -s https://jmap.yourdomain.com/auth/token \
  -u 'user@yourdomain.com:password' | jq -r '.accessToken')

# Use token for requests
curl https://jmap.yourdomain.com/jmap/session \
  -H "Authorization: Bearer $TOKEN"
```

## Autodiscovery Details

### SRV Record Method

Clients query DNS for:
```
_jmap._tcp.yourdomain.com
```

Response:
```
_jmap._tcp.yourdomain.com. 300 IN SRV 0 0 443 jmap.yourdomain.com.
```

Client connects to: `https://jmap.yourdomain.com`

### HTTP Redirect Method

Client requests:
```
GET https://yourdomain.com/.well-known/jmap
```

Response:
```
HTTP/1.1 301 Moved Permanently
Location: https://jmap.yourdomain.com/jmap/session
```

Client follows redirect to session endpoint.

## Testing Client Connection

### Verify CORS (Web Clients)

```bash
curl -I -H "Origin: https://your-client.com" \
  https://jmap.yourdomain.com/jmap/session
```

Look for `Access-Control-Allow-Origin` header.

### Verify Autodiscovery

```bash
# SRV record
dig _jmap._tcp.yourdomain.com SRV

# HTTP redirect
curl -I https://yourdomain.com/.well-known/jmap
```

### Verify Authentication

See [API_EXAMPLES.md](API_EXAMPLES.md) for example commands.

## Troubleshooting

### CORS Errors

- Ensure client origin is in `ALLOWED_ORIGINS` in `config.mk`
- Redeploy after changing `ALLOWED_ORIGINS`
- Clear browser cache
- Verify CORS headers with curl (see above)

### Autodiscovery Not Working

- Verify DNS records are correct (check `infrastructure/dns-records.txt`)
- Wait 10-15 minutes for DNS propagation
- Test DNS: `dig yourdomain.com` and `dig jmap.yourdomain.com`
- Check CloudFront distribution status in AWS Console

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for more details.

