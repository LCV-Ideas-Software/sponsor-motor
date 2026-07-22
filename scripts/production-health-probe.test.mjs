import assert from 'node:assert/strict';

import probe from './production-health-probe.mjs';

const expectedVersionId = '95a2ba5b-78c5-408b-a913-65bb6ba0ac1d';
let upstreamRequest;
const env = {
  WORKER_NAME: 'sponsor-motor',
  EXPECTED_WORKER_VERSION_ID: expectedVersionId,
  SPONSOR: {
    async fetch(request) {
      upstreamRequest = request;
      return Response.json({ ok: true, service: 'sponsor-motor', version: 'APP v01.02.05' });
    },
  },
};

const response = await probe.fetch(new Request('http://127.0.0.1/probe'), env);
assert.equal(response.status, 200);
assert.deepEqual(await response.json(), {
  ok: true,
  service: 'sponsor-motor',
  version: 'APP v01.02.05',
});
assert.equal(upstreamRequest.method, 'GET');
assert.equal(new URL(upstreamRequest.url).pathname, '/api/health');
assert.equal(
  upstreamRequest.headers.get('Cloudflare-Workers-Version-Overrides'),
  `sponsor-motor="${expectedVersionId}"`,
);

const postResponse = await probe.fetch(new Request('http://127.0.0.1/probe', { method: 'POST' }), env);
assert.equal(postResponse.status, 405);

const unknownResponse = await probe.fetch(new Request('http://127.0.0.1/unknown'), env);
assert.equal(unknownResponse.status, 404);

console.log('Authenticated service binding probe unit tests passed.');
