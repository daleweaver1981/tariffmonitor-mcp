// 2026-11-10 benchmark fixes: full country names are accepted; an invented statistical suffix is not presented as a real line.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { callTool } from "../src/tools.js";
import { toIso2 } from "../src/countries.js";

const real = globalThis.fetch;
afterEach(() => { globalThis.fetch = real; });
const text = (r) => r.content[0].text;

test("toIso2 maps common names and leaves ISO-2 alone", () => {
  assert.equal(toIso2("China"), "CN");
  assert.equal(toIso2("viet nam"), "VN");
  assert.equal(toIso2("South Korea"), "KR");
  assert.equal(toIso2("uk"), "GB");
  assert.equal(toIso2("mx"), "MX");
  assert.equal(toIso2("Atlantis"), "ATLANTIS");
});

test("calculate_tariff accepts a country name and sends the ISO-2 code", async () => {
  const urls = [];
  globalThis.fetch = async (u) => { urls.push(String(u)); return new Response(JSON.stringify({ ok: false, error: "HTS code not found in current schedule" }), { status: 200, headers: { "content-type": "application/json" } }); };
  const r = await callTool("calculate_tariff", { hts_code: "6109100012", origin_country: "Vietnam" });
  assert.doesNotMatch(text(r), /must be an ISO-2/);
  assert.ok(urls.some((u) => u.includes("country=VN")));
});

test("an invented suffix says the shown description is only the first line under the heading", async () => {
  const good = { ok: true, hts10: "9403608010", description: "Play yards", base_rate: 0, total_rate: 0, layers: [], as_of: "2026-11-10", cliff_date: "2027-01-10", cliff_total_rate: 0 };
  globalThis.fetch = async (u) => {
    const hts = new URL(String(u)).searchParams.get("hts");
    return new Response(JSON.stringify(hts === "94036080" ? good : { ok: false, error: "HTS code not found in current schedule" }), { status: hts === "94036080" ? 200 : 200, headers: { "content-type": "application/json" } });
  };
  const r = await callTool("calculate_tariff", { hts_code: "9403608081", origin_country: "MX" });
  assert.match(text(r), /not a line in the schedule/);
  assert.match(text(r), /first statistical line listed under it/);
  assert.match(text(r), /lookup_hts_code 94036080/);
  assert.doesNotMatch(text(r), /resolved to/);
});
