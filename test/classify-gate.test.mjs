// Default (TM_CLASSIFY_PHOTOS unset): classify_product is advertised as text-only and photo input is refused.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOOLS } from '../src/tools.js';
import { loadImage } from '../src/classify.js';
test('photos off by default: listing offers text only', () => {
  const t = TOOLS.find((x) => x.name === 'classify_product');
  assert.ok(t);
  assert.deepEqual(Object.keys(t.inputSchema.properties).sort(), ['description', 'origin_country']);
  assert.deepEqual(t.inputSchema.required, ['description']);
  assert.doesNotMatch(t.description, /photo|image/i);
});
test('photos off by default: loadImage refuses', async () => {
  await assert.rejects(() => loadImage({ image_url: 'https://example.org/a.jpg' }), /not available yet/);
});
