// 2026-11-10 (benchmark): importers type "China" or "Vietnam", not "CN". Map common full names to ISO-2.
// Two-letter input passes through unchanged (the API still rejects an unknown code); only exact names are mapped.
const NAMES = {
  china: "CN", "peoples republic of china": "CN", prc: "CN", vietnam: "VN", "viet nam": "VN", mexico: "MX", india: "IN",
  thailand: "TH", "south korea": "KR", korea: "KR", "republic of korea": "KR", taiwan: "TW", japan: "JP", germany: "DE",
  italy: "IT", france: "FR", spain: "ES", "united kingdom": "GB", uk: "GB", "great britain": "GB", england: "GB",
  canada: "CA", brazil: "BR", indonesia: "ID", malaysia: "MY", philippines: "PH", bangladesh: "BD", pakistan: "PK",
  "sri lanka": "LK", cambodia: "KH", turkey: "TR", turkiye: "TR", "hong kong": "HK", singapore: "SG", australia: "AU",
  netherlands: "NL", poland: "PL", portugal: "PT", israel: "IL", switzerland: "CH", egypt: "EG", "united states": "US",
};
export function toIso2(v) {
  const raw = String(v ?? "").trim();
  if (/^[A-Za-z]{2}$/.test(raw)) return raw.toUpperCase() === "UK" ? "GB" : raw.toUpperCase();
  const k = raw.toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();
  return NAMES[k] || raw.toUpperCase();
}
