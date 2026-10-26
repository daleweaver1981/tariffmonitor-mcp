# Tariff answer benchmark, 26 Oct 2026

Source: competitor-scout benchmark of 26 Oct 2026, checked against HTSUS 2026 Revision 21 chapter 99 (USITC PDF).
The scout's full text was not saved before this file was written. This file summarises its findings as relayed in the
fix brief, plus what the fix found when each line was checked against the primary source.

## Findings (before the fix)

- **Section 232 applied by chapter, not by line.** All of ch. 72/74/76 was charged 50% and nothing elsewhere. U.S. note 16(c)
  (headings 9903.82.02-.26, effective 6 Apr 2026) is a line list across ch. 73 and 82-94, so the engine:
  - missed derivatives: 7323.93.00.80 (stainless household articles) CN came out at 14.5% (2 MFN + 12.5 forced labor) instead of about 27%; 8418.10 refrigerator-freezers had no 232 layer;
  - over-charged lines that are on no list or are listed at 25%: 7615.10.20.15 bakeware CN came out at 53.1% (232 at 50%) instead of 28.1% (232 derivative at 25%).
- **The forced-labor 301 exemption for 232 goods (note 52(f)(1))** depended on the wrong 232 answer.
- **Brazil Section 301 missing.** 25% on all products of Brazil from 22 Jul 2026 (9903.05.01, note 50; FR Doc. 2026-14542). 6109.10.00.12 BR came out at 29% instead of 54%.
- **Canada Section 338 not covered.**
- **Lookup:** everyday words (t-shirt, water bottle) found nothing or the wrong goods, and lines were not ranked.
- **Confirmed correct:** 8507.60.00.90 CN 40.9%, 6109.10.00.12 CN 36.5%, 9617.00.10 CN 19.7%, 6404.11.20.30 CN 30.5%.

## After the fix (live, 26 Oct 2026)

| Line | Origin | Before | After | Primary-source basis |
|---|---|---|---|---|
| 7323.93.00.80 | CN | 14.5 | 27.0 | 2 MFN + 25 (note 16(c)(vii), 9903.82.09); forced labor exempt under 52(f)(1) |
| 7202.11.10.00 | CN | 26.4 | 26.4 | 1.4 MFN + 25 China 301; on no 232 list; forced labor exempt under **note 52(b)** (9903.05.86 lists 7202.11.10). The scout's ~38.9% added forced labor at 12.5%, which the note excludes, so the benchmark figure was wrong on this line |
| 7615.10.20.15 | CN | 53.1 | 28.1 | 3.1 MFN + 25 (note 16(c)(vi)) |
| 8418.10.00.10 | CN | 25.0 (no 232) | 50.0 | 0 MFN + 25 China 301 + 25 (note 16(c)(vi)/(vii)) |
| 6109.10.00.12 | BR | 29.0 | 54.0 | 16.5 + 25 Brazil 301 + 12.5 forced labor |
| 8507.60.00.90 | CN | 40.9 | 40.9 | unchanged; flagged "Section 232 may apply" (named in note 33, auto parts) |
| 6109.10.00.12 | CN | 36.5 | 36.5 | unchanged |
| 9617.00.10.00 | CN | 19.7 | 19.7 | unchanged |
| 6404.11.20.30 | CN | 30.5 | 30.5 | unchanged |

Canada Section 338: verified in the Federal Register (Proclamations 11046-11048, 50% from 22 Aug 2026; scope changed 15 Sep;
import bans from 29 Sep). The product annexes are published as images and are not in the HTSUS text, so CA answers carry a
"may apply, verify" note, not a rate.

Also found and flagged (not computed, annexes are images): Section 232 unmanned aircraft (8806; 100%/25% from 3 Sep 2026,
FR Doc. 2026-16979) and the polysilicon minimum import price (from 4 Dec 2026, FR Doc. 2026-16400).

Guards: test/canary-lines.json (22 lines) + scripts/tariff-canary.mjs (daily 11:40 CT150 cron, CEO due item on drift);
scripts/fr-tariff-watch.mjs (daily 11:50; new Federal Register tariff documents and unknown chapter 99 headings go to the CEO due list).
