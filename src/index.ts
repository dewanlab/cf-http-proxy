/**
 * Cloudflare Worker - Universal Reverse Proxy
 *
 * Dynamically proxies all incoming HTTP requests to a target URL configured via the `_TARGET_URL`
 * URL parameter (overrides `TARGET_URL`) or the `TARGET_URL` environment variable, preserving HTTP
 * method, headers, query parameters, URL path, and request body.
 *
 * Features:
 * - Dynamic Target Origin configuration via `_TARGET_URL` query parameter or `TARGET_URL` env variable.
 * - Dynamic path & trailing slash normalization.
 * - Full request forwarding (methods, headers, path, query params, body stream).
 * - Global CORS support (Access-Control-Allow-Origin: * and preflight handling).
 * - Robust error handling (500 for missing config, 502/504 for gateway issues).
 */

export interface Env {
	/**
	 * Target origin URL (e.g., "https://smsprovider.com" or "https://api.example.com/v1")
	 */
	TARGET_URL?: string;
}

/**
 * Returns standard global CORS headers.
 */
function getCorsHeaders(): Headers {
	const headers = new Headers();
	headers.set('Access-Control-Allow-Origin', '*');
	headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD');
	headers.set('Access-Control-Allow-Headers', '*');
	headers.set('Access-Control-Expose-Headers', '*');
	headers.set('Access-Control-Max-Age', '86400');
	return headers;
}

export default {
	async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
		// 1. Handle CORS Preflight (OPTIONS) requests
		if (request.method === 'OPTIONS') {
			return new Response(null, {
				status: 204,
				headers: getCorsHeaders(),
			});
		}

		// 2. Resolve and validate target URL from URL parameter (_TARGET_URL) or environment variable (TARGET_URL)
		const incomingUrl = new URL(request.url);
		const targetUrlParam = incomingUrl.searchParams.get('_TARGET_URL');
		const targetUrlSource = targetUrlParam && targetUrlParam.trim() !== '' ? targetUrlParam : env.TARGET_URL;

		if (!targetUrlSource || typeof targetUrlSource !== 'string' || targetUrlSource.trim() === '') {
			const corsHeaders = getCorsHeaders();
			corsHeaders.set('Content-Type', 'application/json');
			return new Response(
				JSON.stringify({
					error: 'Configuration Error',
					message:
						'Target URL is missing or empty. Please specify it via the _TARGET_URL query parameter or set TARGET_URL in wrangler.jsonc / Cloudflare Dashboard.',
				}),
				{
					status: 500,
					headers: corsHeaders,
				},
			);
		}

		let targetBase: URL;
		try {
			targetBase = new URL(targetUrlSource.trim());
		} catch {
			const corsHeaders = getCorsHeaders();
			corsHeaders.set('Content-Type', 'application/json');
			return new Response(
				JSON.stringify({
					error: 'Configuration Error',
					message: `Invalid target URL configuration: '${targetUrlSource}' is not a valid URL.`,
				}),
				{
					status: 500,
					headers: corsHeaders,
				},
			);
		}

		// 3. Build target URL by combining target origin base path with incoming pathname & query string
		let basePath = targetBase.pathname;
		if (basePath.endsWith('/')) {
			basePath = basePath.slice(0, -1);
		}

		const targetUrl = new URL(targetBase.origin);
		targetUrl.pathname = basePath + incomingUrl.pathname;

		// Clone search params and remove _TARGET_URL so it is not forwarded upstream
		const forwardSearchParams = new URLSearchParams(incomingUrl.searchParams);
		forwardSearchParams.delete('_TARGET_URL');
		const queryString = forwardSearchParams.toString();
		targetUrl.search = queryString ? `?${queryString}` : '';

		// 4. Prepare headers for upstream request
		const forwardHeaders = new Headers(request.headers);
		// Update Host header to match target host domain
		forwardHeaders.set('Host', targetUrl.host);
		// Remove Cloudflare internal headers to avoid interference
		forwardHeaders.delete('cf-connecting-ip');
		forwardHeaders.delete('cf-ipcountry');
		forwardHeaders.delete('cf-ray');
		forwardHeaders.delete('cf-visitor');

		// Prepare request configuration
		const requestInit: RequestInit = {
			method: request.method,
			headers: forwardHeaders,
			redirect: 'manual',
		};

		// Include body for requests that carry payload (POST, PUT, PATCH, DELETE, etc.)
		if (request.method !== 'GET' && request.method !== 'HEAD') {
			requestInit.body = request.body;
			// Duplex is required when sending a ReadableStream body in modern fetch implementations
			(requestInit as Record<string, unknown>).duplex = 'half';
		}

		// 5. Forward request to target server with error handling
		try {
			const targetResponse = await fetch(targetUrl.toString(), requestInit);

			// Copy response headers and apply CORS headers
			const responseHeaders = new Headers(targetResponse.headers);
			const corsHeaders = getCorsHeaders();
			corsHeaders.forEach((value, key) => {
				responseHeaders.set(key, value);
			});

			return new Response(targetResponse.body, {
				status: targetResponse.status,
				statusText: targetResponse.statusText,
				headers: responseHeaders,
			});
		} catch (err: unknown) {
			const error = err as Error;
			const corsHeaders = getCorsHeaders();
			corsHeaders.set('Content-Type', 'application/json');

			const isTimeout = error.name === 'TimeoutError' || (error.message && error.message.toLowerCase().includes('timeout'));
			const status = isTimeout ? 504 : 502;
			const errorTitle = isTimeout ? 'Gateway Timeout' : 'Bad Gateway';

			return new Response(
				JSON.stringify({
					error: errorTitle,
					message: `Proxy failed to connect to target origin '${targetUrl.origin}': ${error.message || 'Unknown error'}`,
				}),
				{
					status,
					headers: corsHeaders,
				},
			);
		}
	},
} satisfies ExportedHandler<Env>;
