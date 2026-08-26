# Universal HTTP Reverse Proxy for Cloudflare Workers

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare_Workers-F38020?style=flat&logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

A highly efficient, generalized, edge-based universal HTTP reverse proxy built for **Cloudflare Workers**.

It dynamically proxies incoming requests to any configured target origin, preserving HTTP methods, headers, query parameters, URL path hierarchies, and body streams, while injecting global CORS headers and providing robust edge error handling.

---

## Key Features

- 🎯 **Dynamic Target Origin (`TARGET_URL`)**: Set target base URL via an environment variable (`https://smsprovider.com`, `https://api.example.com/v1`, etc.). Handles trailing slashes cleanly.
- 🔄 **Full Request Forwarding**: Seamlessly preserves:
  - HTTP Methods (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`, `HEAD`, etc.)
  - Headers (with automatic `Host` header re-writing for target origin compatibility)
  - URL Paths & Subpaths
  - Query String Parameters
  - Request Payloads / Streaming Body streams (`duplex: "half"`)
- 🌐 **Global CORS Enabled**:
  - Injects `Access-Control-Allow-Origin: *` across all proxied and error responses.
  - Full preflight `OPTIONS` request handling with `204 No Content`.
  - Exposes headers (`Access-Control-Expose-Headers: *`) for frontend integration.
- 🛡️ **Edge Error Handling**:
  - `500 Internal Server Error` for missing or invalid `TARGET_URL` configurations.
  - `502 Bad Gateway` / `504 Gateway Timeout` for upstream origin server errors or connection issues.
- ⚡ **Zero External Dependencies**: Lightweight and fast TypeScript ES Modules implementation running directly on V8 edge workers.

---

## Quick Start

### 1. Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Cloudflare Account](https://dash.cloudflare.com/) (Free or Paid)

### 2. Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/dewanlabs/cf-http-proxy.git
cd cf-http-proxy
npm install
```

### 3. Configuration

Set your target URL in [`wrangler.jsonc`](wrangler.jsonc):

```jsonc
{
	"name": "cf-http-proxy",
	"main": "src/index.ts",
	"compatibility_date": "2026-08-25",
	"vars": {
		"TARGET_URL": "https://httpbin.org",
	},
}
```

Or create a local `.dev.vars` file for local development:

```ini
TARGET_URL=https://httpbin.org
```

---

## Local Development & Testing

Start the local Wrangler development server:

```bash
npm run dev
```

Run unit test suite with Vitest and Cloudflare Workers plugin:

```bash
npm test
```

Generate TypeScript types from `wrangler.jsonc` bindings:

```bash
npm run cf-typegen
```

Run TypeScript type checker:

```bash
npm run typecheck
```

Lint code with ESLint:

```bash
npm run lint         # Check for lint errors
npm run lint:fix     # Automatically fix lint errors
```

Format code with Prettier:

```bash
npm run format       # Format code in-place
npm run format:check # Verify code formatting
```

---

## Deployment

### Option 1: Deploy via Wrangler CLI

Deploy directly to your Cloudflare account:

```bash
npm run deploy
```

Set or update `TARGET_URL` in production using Wrangler secrets:

```bash
npx wrangler secret put TARGET_URL
```

### Option 2: Deploy via Cloudflare Dashboard

1. Go to **Cloudflare Dashboard** -> **Workers & Pages** -> **Create Application**.
2. Create a new Worker and paste the content of [`src/index.ts`](./src/index.ts).
3. Navigate to **Settings** -> **Variables & Assets** -> **Environment Variables**.
4. Add `TARGET_URL` as a variable (e.g., `https://api.yourprovider.com`).
5. Click **Save and Deploy**.

---

## Architecture & How It Works

```
  Client (Browser / App)
         │
         │  HTTP Request (GET / POST / PUT / OPTIONS...)
         ▼
┌─────────────────────────────────────────────────────────┐
│ Cloudflare Worker (cf-http-proxy)                        │
│                                                         │
│ 1. Intercept preflight (OPTIONS) -> return CORS 204      │
│ 2. Validate env.TARGET_URL                              │
│ 3. Resolve target URL: target.origin + basePath + path   │
│ 4. Rewrite Host header & sanitize proxy headers          │
│ 5. Forward request body & method to target origin        │
└──────────────────────────┬──────────────────────────────┘
                           │
                           │  Proxied Request
                           ▼
                  Target Origin Server
```

---

## License

This project is licensed under the [MIT License](./LICENSE). Created by [Abdullah Dewan](https://abdullahdewan.com).
