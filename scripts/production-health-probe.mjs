export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method !== 'GET') {
      return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET' } });
    }
    if (url.pathname !== '/probe') {
      return new Response('Not Found', { status: 404 });
    }

    if (!env.WORKER_NAME || !env.EXPECTED_WORKER_VERSION_ID) {
      return new Response('Probe configuration is incomplete', { status: 500 });
    }

    const upstream = await env.SPONSOR.fetch(
      new Request('https://service-binding.invalid/api/health', {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'Cache-Control': 'no-store',
          'Cloudflare-Workers-Version-Overrides': `${env.WORKER_NAME}="${env.EXPECTED_WORKER_VERSION_ID}"`,
        },
      }),
    );

    const headers = new Headers({ 'Cache-Control': 'no-store' });
    const contentType = upstream.headers.get('content-type');
    if (contentType) headers.set('content-type', contentType);
    return new Response(upstream.body, { status: upstream.status, headers });
  },
};
