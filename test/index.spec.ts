import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, it, expect, vi, afterEach } from 'vitest';
import worker, { Env } from '../src/index';

describe('Universal Reverse Proxy Worker', () => {
	const originalFetch = globalThis.fetch;

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it('handles OPTIONS preflight CORS requests', async () => {
		const request = new Request('https://proxy.dev/api/data', { method: 'OPTIONS' });
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, { TARGET_URL: 'https://example.com' }, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(204);
		expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
		expect(response.headers.get('Access-Control-Allow-Methods')).toContain('GET');
	});

	it('returns 500 when TARGET_URL is missing and _TARGET_URL query param is not provided', async () => {
		const request = new Request('https://proxy.dev/api/data', { method: 'GET' });
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, {} as Env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(500);
		const json = (await response.json()) as { error: string };
		expect(json.error).toBe('Configuration Error');
		expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
	});

	it('returns 500 when TARGET_URL is invalid and no valid _TARGET_URL is provided', async () => {
		const request = new Request('https://proxy.dev/api/data', { method: 'GET' });
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, { TARGET_URL: 'not-a-valid-url' }, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(500);
		const json = (await response.json()) as { error: string };
		expect(json.error).toBe('Configuration Error');
	});

	it('uses _TARGET_URL query parameter when provided and ignores TARGET_URL env var', async () => {
		let fetchedUrl = '';

		globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
			fetchedUrl = url;
			return new Response('OK from dynamic param target', { status: 200 });
		}) as unknown as typeof fetch;

		const request = new Request('https://proxy.dev/endpoint?_TARGET_URL=https://dynamic-target.com/api&foo=bar&test=1', {
			method: 'GET',
		});
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, { TARGET_URL: 'https://ignored-default.com' }, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(200);
		expect(await response.text()).toBe('OK from dynamic param target');
		// Verifies dynamic target is used and _TARGET_URL is excluded from forwarded query string
		expect(fetchedUrl).toBe('https://dynamic-target.com/api/endpoint?foo=bar&test=1');
	});

	it('works with _TARGET_URL when TARGET_URL env var is completely missing', async () => {
		let fetchedUrl = '';

		globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
			fetchedUrl = url;
			return new Response('OK', { status: 200 });
		}) as unknown as typeof fetch;

		const request = new Request('https://proxy.dev/data?_TARGET_URL=https://param-target.com', {
			method: 'GET',
		});
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, {} as Env, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(200);
		expect(fetchedUrl).toBe('https://param-target.com/data');
	});

	it('forwards GET request to target URL with path and query parameters', async () => {
		let fetchedUrl = '';
		let fetchedHeaders: Headers | undefined;

		globalThis.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
			fetchedUrl = url;
			fetchedHeaders = new Headers(init?.headers);
			return new Response('OK from target', { status: 200, headers: { 'X-Target-Header': 'foo' } });
		}) as unknown as typeof fetch;

		const request = new Request('https://proxy.dev/users?id=123', {
			method: 'GET',
			headers: { Authorization: 'Bearer token123' },
		});
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, { TARGET_URL: 'https://target-api.com/v1' }, ctx);
		await waitOnExecutionContext(ctx);

		expect(fetchedUrl).toBe('https://target-api.com/v1/users?id=123');
		expect(fetchedHeaders?.get('Host')).toBe('target-api.com');
		expect(fetchedHeaders?.get('Authorization')).toBe('Bearer token123');
		expect(response.status).toBe(200);
		expect(await response.text()).toBe('OK from target');
		expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
	});

	it('forwards POST request body to target URL', async () => {
		let fetchedBody = '';
		let fetchedMethod = '';

		globalThis.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
			fetchedMethod = init?.method || '';
			if (init?.body) {
				if (typeof init.body === 'string') {
					fetchedBody = init.body;
				} else if (init.body instanceof ReadableStream) {
					const reader = init.body.getReader();
					const { value } = await reader.read();
					fetchedBody = new TextDecoder().decode(value);
				}
			}
			return new Response(JSON.stringify({ success: true }), { status: 201 });
		}) as unknown as typeof fetch;

		const payload = JSON.stringify({ message: 'hello' });
		const request = new Request('https://proxy.dev/send', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: payload,
		});
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, { TARGET_URL: 'https://target-api.com/' }, ctx);
		await waitOnExecutionContext(ctx);

		expect(fetchedMethod).toBe('POST');
		expect(fetchedBody).toBe(payload);
		expect(response.status).toBe(201);
		expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
	});

	it('returns 502 Bad Gateway when target fetch throws network error', async () => {
		globalThis.fetch = vi.fn().mockRejectedValue(new Error('DNS resolution failed'));

		const request = new Request('https://proxy.dev/data', { method: 'GET' });
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, { TARGET_URL: 'https://down-target.com' }, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(502);
		const json = (await response.json()) as { error: string; message: string };
		expect(json.error).toBe('Bad Gateway');
		expect(json.message).toContain('DNS resolution failed');
		expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
	});
});
