# API Examples

This document provides example commands for interacting with the JMAP server API.

## Base URL

Replace `jmapbox.com` with your domain:
- API: `https://jmap.jmapbox.com`
- Autodiscovery: `https://jmapbox.com`

## Authentication

Get an access token:

```bash
TOKEN=$(curl -s https://jmap.jmapbox.com/auth/token \
  -u 'admin@jmapbox.com:Password123!' | jq -r '.accessToken')
```

## Logout

```bash
curl -X POST https://jmap.jmapbox.com/auth/logout \
  -H "Authorization: Bearer $TOKEN"
```

## JMAP Endpoints

### Session Discovery

```bash
curl https://jmap.jmapbox.com/jmap/session \
  -H "Authorization: Bearer $TOKEN"
```
