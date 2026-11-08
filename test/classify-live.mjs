// LIVE checks against the self-hosted Ollama (slow, manual): TM_OLLAMA_URL=http://10.0.0.30:11434 node test/classify-live.mjs
// (a) text "men's 100% cotton knit t-shirt" must include a 6109.10 candidate
// (b) a Wikimedia Commons (openly licensed) product photo: top candidates sensible, every code in our HTS data.
import { callTool } from '../src/tools.js';
const args = process.argv.slice(2);
const which = args[0] || 'text';
const t0 = Date.now();
let a;
if (which === 'text') a = { description: "men's 100% cotton knit t-shirt", origin_country: 'CN' };
else a = { image_url: args[1], origin_country: 'VN' };
const r = await callTool('classify_product', a);
console.log(r.content[0].text);
console.log(`\n[${which}] ${Math.round((Date.now() - t0) / 1000)} s, isError=${!!r.isError}`);
const c = r.structuredContent?.candidates || [];
// every code must exist in our HTS data
let allIn = true;
for (const x of c) {
  const j = await (await fetch('https://adcreator-ai.com/api/tem/hts/search?limit=5&q=' + x.hts10)).json();
  const ok = (j.results || []).some((y) => y.hts10 === x.hts10);
  if (!ok) allIn = false;
  console.log('in our data:', x.hts10, ok);
}
if (which === 'text') {
  const has = c.some((x) => x.hts10.startsWith('610910'));
  console.log('has 6109.10 candidate:', has);
  process.exit(has && allIn ? 0 : 1);
}
process.exit(allIn && c.length ? 0 : 1);
