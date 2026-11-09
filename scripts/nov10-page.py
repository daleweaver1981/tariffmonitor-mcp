#!/usr/bin/env python3
"""What changes on 10 Nov 2026: HTS codes whose US duty rises (tariffmonitor public page generator, 3 Nov 2026).

Builds https://adcreator-ai.com/tariffs/november-10-2026 from primary sources plus the live engine:
  1. HTSUS chapter 99 (current revision, USITC): re-verifies on every run that headings 9903.88.69/9903.88.70
     still end "through November 9, 2026" and that 9903.91.12/9903.91.14 still start "on or after November 10, 2026",
     and parses the 178 Section 301 China product exclusions in U.S. note 20(vvv)(i)-(iv) and 20(www).
     Any mismatch -> no deploy + one CEO due item (the page keeps its last good version).
  2. Federal Register API: looks for a USTR notice published after the known ones that extends the exclusions or
     finalises a further suspension of the maritime Section 301 action. If one appears, the page shows it at the top
     the same day (title, date, link) and a CEO due item asks a person to rewrite the affected rows.
  3. Engine (https://adcreator-ai.com/api/tem/rate, country CN, as_of=2026-11-09): since 4 Nov 2026 the engine itself applies
     the exclusions by statistical number and the maritime headings by date, so every figure on the page is the engine's own
     answer (before = rate on 9 Nov with the exclusion; after = its cliff_total_rate / the rate on the maritime start date).
Run daily from scripts/fr-tariff-watch.mjs (cron 11:50Z) and on its own: python3 scripts/nov10-page.py [--deploy] [--out DIR]
No speculation: the page states what the notices say; where chapter 99 does not settle how two duties combine,
the page says so and labels the figure "up to".
"""
import json, re, sys, os, html, hashlib, subprocess, tempfile, time, datetime, urllib.request, urllib.parse, urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARGS = sys.argv[1:]
DEPLOY = '--deploy' in ARGS
OUT = ARGS[ARGS.index('--out') + 1] if '--out' in ARGS else os.path.join(ROOT, 'data', 'nov10')
STATE = os.path.join(ROOT, 'data', 'nov10-state.json')
UA = {'User-Agent': 'Mozilla/5.0 (tariffmonitor nov10-page; +https://adcreator-ai.com/tariffs/november-10-2026)'}
CH99 = 'https://hts.usitc.gov/reststop/file?release=currentRelease&filename=Chapter%2099'
API = os.environ.get("TEM_API", "http://10.0.0.105:3000/api/tem") + "/rate"  # LAN: no per-IP limit (server.js apiLimiter skip); public host as fallback via TEM_API
URL = 'https://adcreator-ai.com/tariffs/november-10-2026'
VM100_HTML = 'adcreator:~/adcreator-ai/public/tariffs-november-10-2026.html'
VM100_JSON = 'adcreator:~/adcreator-ai/public/data/tariffs-november-10-2026.json'
INDEXNOW_KEY = '102914a195884c93f56ea4fa819866f3'
# Federal Register documents already read and reflected in the page text (checked 2026-11-03).
# What a notice on the alert list does, read from its text (keeper 2026-11-09). Shown in the alert in plain words
# until the page body is rewritten for it.
NOTICE_EFFECT = {
    '2026-22925': 'USTR extended all 178 exclusions "through 11:59 p.m. eastern time on January 9, 2027". They do not end on 9 November 2026.',
    '2026-22867': 'USTR further suspended the maritime action "through 11:59 p.m. Eastern Time on January 9, 2027". Headings 9903.91.12 and 9903.91.14 do not apply from 10 November 2026.',
}
KNOWN_FR = {'2025-21671', '2025-19873', '2025-19839', '2025-19568', '2026-21755', '2026-20511', '2026-17925', '2026-20510'}
SRC = {
    'excl': ('FR Doc. 2025-21671, 90 FR 55232 (1 Dec 2025)', 'https://www.federalregister.gov/documents/2025/12/01/2025-21671/notice-of-product-exclusion-extensions-chinas-acts-policies-and-practices-related-to-technology'),
    'mar_action': ('FR Doc. 2025-19568, 90 FR 48320 (16 Oct 2025)', 'https://www.federalregister.gov/documents/2025/10/16/2025-19568/notice-of-modification-and-proposed-modification-of-section-301-action-chinas-targeting-of-the'),
    'mar_susp': ('FR Doc. 2025-19873, 90 FR 50947 (13 Nov 2025)', 'https://www.federalregister.gov/documents/2025/11/13/2025-19873/notice-of-modification-of-section-301-action-chinas-targeting-of-the-maritime-logistics-and'),
    'mar_rfc': ('FR Doc. 2026-21755, 91 FR 67388 (26 Oct 2026)', 'https://www.federalregister.gov/documents/2026/10/26/2026-21755/request-for-comments-on-further-suspension-of-section-301-action-chinas-targeting-of-the-maritime'),
    'ch99': ('HTSUS 2026 chapter 99 (USITC, current revision)', 'https://hts.usitc.gov/reststop/file?release=currentRelease&filename=Chapter%2099'),
}

def get(url, binary=False, timeout=60):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
        b = r.read()
    return b if binary else b.decode('utf-8', 'replace')

def due(prefix, text):
    if not os.path.exists('/root/youtube-pipeline/_ceo-due-add.js'):
        print('DUE (no helper):', prefix, text); return
    with tempfile.NamedTemporaryFile('w', delete=False, prefix='_tmp-claude-nov10-', suffix='.txt') as f:
        f.write(text); p = f.name
    try: print(subprocess.run(['node', '/root/youtube-pipeline/_ceo-due-add.js', prefix, p], capture_output=True, text=True).stdout.strip())
    finally: os.unlink(p)

def fail(msg):
    print('ABORT:', msg)
    due('TARIFF NOV10 PAGE CHECK FAILED %s:' % datetime.date.today(), msg + ' The page was NOT redeployed (last good version stays live). Script: CT150 /root/mcp-servers/tariffmonitor-mcp/scripts/nov10-page.py')
    sys.exit(2)

# ---------- 1. primary source: HTSUS chapter 99 ----------
def chapter99_text():
    pdf = get(CH99, binary=True, timeout=180)
    if not pdf.startswith(b'%PDF'): fail('Chapter 99 download is not a PDF.')
    with tempfile.TemporaryDirectory(prefix='_tmp-claude-ch99-') as d:
        open(os.path.join(d, 'c.pdf'), 'wb').write(pdf)
        subprocess.run(['pdftotext', '-layout', os.path.join(d, 'c.pdf'), os.path.join(d, 'c.txt')], check=True)
        return open(os.path.join(d, 'c.txt'), encoding='utf-8', errors='replace').read()

def heading_text(L, code):
    for i, s in enumerate(L):
        if s.startswith(code + ' '):
            out = []
            for t in L[i + 1:i + 40]:
                if re.match(r'^9903\.\d\d', t) or t.startswith('1/ See chapter 99'): break
                out.append(t)
            return re.sub(r'\s+', ' ', ' '.join(out))
    return ''

def verify_headings(L):
    rev = re.search(r'Harmonized Tariff Schedule of the United States (Revision \d+ \(\d{4}\)|\(\d{4}\) Revision \d+)', '\n'.join(L[:400]))
    checks = {
        '9903.88.69': 'through November 9, 2026', '9903.88.70': 'through November 9, 2026',
        '9903.91.12': 'on or after November 10, 2026', '9903.91.14': 'on or after November 10, 2026',
    }
    found = {}
    for code, phrase in checks.items():
        t = heading_text(L, code)
        found[code] = t
        if phrase not in t: fail('HTSUS chapter 99 heading %s no longer reads "%s" (text now: %s). An extension or change may have been published.' % (code, phrase, t[:300]))
    if '100%' not in found['9903.91.12'] or '100%' not in found['9903.91.14']: fail('9903.91.12/9903.91.14 no longer show +100%.')
    return rev.group(1) if rev else 'current revision'

def parse_exclusions(L):
    try:
        start = next(i for i, s in enumerate(L) if re.match(r'^\s*\(vvv\)\s*\(i\)\s+The U\.S\. Trade Representative', s))
        end = next(i for i in range(start, len(L)) if re.match(r'^21\.\s+\(a\)', L[i]))
    except StopIteration:
        fail('Could not find U.S. note 20(vvv)/(www) in chapter 99.')
    hdr = re.compile(r'Harmonized Tariff Schedule|Annotated for Statistical|^\s*XXII\s*$|^\s*99 - III - \d+|^U\.S\. Notes')
    sub, cur, items, intro, www = None, None, [], {}, 0
    for s in L[start:end]:
        if hdr.search(s): continue
        m = re.match(r'^\s*\((vvv)\)\s*\((i)\)|^\s*\((ii|iii|iv)\) The U\.S\. Trade|^\s*\((www)\)', s)
        if m:
            g = [x for x in m.groups() if x][0]
            sub = 'vvv(i)' if g == 'vvv' else ('www' if g == 'www' else 'vvv(%s)' % g)
            intro[sub] = ''; cur = None; continue
        im = re.match(r'^\s{10,22}\((\d{1,3})\)\s+(.*)$', s)
        if im and sub:
            if sub == 'www':
                www += 1
                if www > 14: sub = None; cur = None; continue   # note 20(www) has 14 items; text after belongs to other notes
            cur = {'sub': sub, 'n': int(im.group(1)), 'text': im.group(2).strip()}; items.append(cur); continue
        if cur is not None and s.strip(): cur['text'] += ' ' + s.strip()
        elif sub and cur is None and s.strip(): intro[sub] += ' ' + s.strip()
    for k, t in intro.items():
        h = re.search(r'additional duties (?:provided for in|imposed by) heading (9903\.\d\d\.\d\d)', t)
        intro[k] = h.group(1) if h else None
    out = []
    for it in items:
        t = re.split(r'\s\(21\)\(a\)', re.sub(r'\s+', ' ', it['text']))[0]
        bare = re.fullmatch(r'(\d{4}\.\d\d\.\d{4})', t)
        if bare: codes, desc = [bare.group(1)], ''
        else:
            m = re.match(r'(.*?)\s*\((described in .*)\)\s*$', t)
            desc = m.group(1) if m else ''
            par = m.group(2) if m else t
            segs = re.split(r';\s*|,\s*(?=described)', par)
            cand = [x for x in segs if 'prior to' not in x and 'through' not in x] or segs[-1:]
            codes = re.findall(r'\d{4}\.\d\d\.\d{4}', ' '.join(cand))
        out.append({'sub': it['sub'], 'n': it['n'], 'excluded_from': intro.get(it['sub']), 'codes': codes, 'description': desc})
    n_vvv = sum(1 for o in out if o['sub'].startswith('vvv')); n_www = sum(1 for o in out if o['sub'] == 'www')
    if (n_vvv, n_www) != (164, 14): fail('Parsed %d note 20(vvv) and %d note 20(www) exclusions; FR Doc. 2025-21671 extended 164 + 14 = 178.' % (n_vvv, n_www))
    if any(not o['codes'] or o['excluded_from'] not in RATE for o in out): fail('An exclusion entry has no statistical number or an unknown list heading.')
    return out

RATE = {'9903.88.01': 25.0, '9903.88.02': 25.0, '9903.88.03': 25.0, '9903.88.15': 7.5}
LIST = {'9903.88.01': 'List 1', '9903.88.02': 'List 2', '9903.88.03': 'List 3', '9903.88.15': 'List 4A'}
MARITIME = [
    ('8716390090', '9903.91.12', 'Intermodal chassis (trailers and semi-trailers, other)'),
    ('8716903000', '9903.91.12', 'Intermodal chassis parts: castors'),
    ('8716905010', '9903.91.12', 'Intermodal chassis parts: axles and parts'),
    ('8716905035', '9903.91.12', 'Intermodal chassis parts: steel wheels 30-42 cm'),
    ('8716905046', '9903.91.12', 'Intermodal chassis parts: wheels of aluminum'),
    ('8716905047', '9903.91.12', 'Intermodal chassis parts: wheels of steel'),
    ('8716905048', '9903.91.12', 'Intermodal chassis parts: other wheels'),
    ('8716905056', '9903.91.12', 'Intermodal chassis parts: wheels with off-highway tires'),
    ('8716905059', '9903.91.12', 'Intermodal chassis parts: wheels with other tires'),
    ('8716905060', '9903.91.12', 'Intermodal chassis parts: other'),
    ('8426190000', '9903.91.14', 'Ship-to-shore gantry cranes (only STS cranes; other 8426.19.00 cranes are not covered)'),
]

_cache = {}
BEFORE = '2026-11-09'
def engine(code, as_of=BEFORE):
    c = code.replace('.', '')
    if (c, as_of) in _cache: return _cache[(c, as_of)]
    d = {'ok': False, 'error': 'not fetched'}
    for _ in range(5):
        try: d = json.loads(get(API + '?hts=%s&country=CN&as_of=%s&utm_source=nov10page' % (c, as_of), timeout=30)); break
        except urllib.error.HTTPError as e:
            body = e.read().decode('utf-8', 'replace')
            try: d = json.loads(body)
            except Exception: d = {'ok': False, 'error': 'HTTP %d' % e.code}
            if e.code == 429:   # engine allows 300 requests / 15 min per IP; wait it out rather than publish holes
                time.sleep(min(int(e.headers.get('Retry-After') or 60), 900) + 2); continue
            break
        except Exception as e: d = {'ok': False, 'error': str(e)[:120]}; time.sleep(15)
    _cache[(c, as_of)] = d; time.sleep(0.3); return d

def short_desc(d):
    p = d.get('description_path') or []
    return ' > '.join(p[-2:]) if p else (d.get('description') or '')

def fmt(c):
    c = c.replace('.', '')
    return '%s.%s.%s' % (c[:4], c[4:6], c[6:]) if len(c) == 10 else c

def build_rows(excl):
    rows, eng_fail = [], 0
    for x in excl:
        hd = x['excluded_from']
        for code in x['codes']:
            d = engine(code)
            r = {'kind': 'exclusion', 'hts': fmt(code), 'program': 'Section 301 China exclusion ends (%s, %s)' % (LIST[hd], hd),
                 'source_note': 'U.S. note %s item (%d); heading %s' % ('20(www)' if x['sub'] == 'www' else '20(vvv)' + x['sub'][3:], x['n'], '9903.88.70' if x['sub'] == 'www' else '9903.88.69'),
                 'description': x['description'] or short_desc(d), 'whole_number': not x['description'], 'rise_pp': RATE[hd]}
            xe = d.get('section_301_exclusion') if d.get('ok') else None
            if xe:
                before = d['total_rate'] if (r['whole_number'] or xe['whole_number']) else xe['total_rate_if_excluded']
                r.update(rate_before=round(before, 2), rate_after=round(d['cliff_total_rate'], 2), from_date=d['cliff_date'], status='computed',
                         engine_status=xe['status'], basis=xe['basis'])
                if xe['status'] != 'in_force' or abs(d['cliff_total_rate'] - before - RATE[hd]) > 0.01:
                    r['adj'] = 'engine: exclusion %s, ends %s' % (xe['status'], xe['last_day'])
            elif d.get('ok'):
                eng_fail += 1; r.update(status='engine_mismatch'); print('engine has no exclusion block for', code)
            else:
                r.update(status='engine_no_code')
                if 'not found' not in str(d.get('error', '')): eng_fail += 1; print('engine error', code, str(d.get('error'))[:100])
            rows.append(r)
    for code, hd, desc in MARITIME:
        d = engine(code)
        r = {'kind': 'maritime', 'hts': fmt(code), 'program': 'Section 301 maritime action, suspension ends (%s, +100%%)' % hd,
             'source_note': 'heading %s; U.S. note 31(%s)' % (hd, 'k)(i' if hd == '9903.91.12' else 'l'), 'description': desc, 'rise_pp': 100.0}
        if d.get('ok'):
            d2 = engine(code, d['maritime_effective_date'])
            if d2.get('ok'):
                r.update(rate_before=round(d['total_rate'], 2), rate_after=round(d2['total_rate'], 2), from_date=d['maritime_effective_date'], status='computed',
                         exact=d2.get('rate_qualifier') != 'up_to', qualifier=d2.get('rate_qualifier'),
                         proposed=[p['basis'] for p in d2.get('depends_on_proposed', [])])
                if hd == '9903.91.14': r['adj'] = 'includes +25% under heading 9903.92.10 (in force since 27 Sep 2024); U.S. note 31(l)(i) stacks the +100% on it'
            else: eng_fail += 1; r.update(status='engine_no_code')
        else: eng_fail += 1; r.update(status='engine_no_code')
        rows.append(r)
    if eng_fail > 5: fail('Engine errors for %d codes (other than "not in schedule"); upstream may be down or rate-limited.' % eng_fail)
    return rows

# ---------- 2. Federal Register: anything new that changes the 10 Nov picture? ----------
def fr_updates():
    found = []
    q = ('https://www.federalregister.gov/api/v1/documents.json?per_page=50&order=newest&conditions[agencies][]=trade-representative-office-of-united-states'
         '&conditions[publication_date][gte]=2026-10-20&fields[]=document_number&fields[]=title&fields[]=publication_date&fields[]=html_url')
    pi = 'https://www.federalregister.gov/api/v1/public-inspection-documents/current.json'
    docs = []
    try: docs += json.loads(get(q)).get('results', [])
    except Exception as e: print('FR API error', e)
    try:
        for r in json.loads(get(pi)).get('results', []):
            ag = ' '.join((a.get('name') or '') if isinstance(a, dict) else str(a) for a in r.get('agencies', []))
            if 'Trade Representative' in ag:
                docs.append({'document_number': r.get('document_number'), 'title': r.get('title') or '', 'publication_date': r.get('publication_date') or '(public inspection)', 'html_url': r.get('html_url') or r.get('pdf_url'), 'public_inspection': True})
    except Exception as e: print('FR public inspection error', e)
    for d in docs:
        if d['document_number'] in KNOWN_FR: continue
        t = d['title']
        excl = re.search(r'exclusion', t, re.I) and re.search(r'Technology Transfer|China', t, re.I) and not re.search(r'Conforming Amendment', t, re.I)
        mar = re.search(r'Maritime, Logistics, and Shipbuilding', t, re.I)
        if excl or mar:
            found.append({'document_number': d['document_number'], 'title': t, 'date': d['publication_date'], 'url': d['html_url'],
                          'topic': 'exclusions' if excl else 'maritime', 'public_inspection': bool(d.get('public_inspection'))})
    return found

# ---------- 3. render ----------
def esc(s): return html.escape(str(s), quote=True)

def pct(v): return ('%.2f' % v).rstrip('0').rstrip('.') + '%'

def render(rows, rev, updates, built):
    today = datetime.date.fromisoformat(built[:10])
    passed = today >= datetime.date(2026, 11, 10)
    n_ex_codes = len({r['hts'] for r in rows if r['kind'] == 'exclusion'})
    upd_html = ''
    if updates:
        li = ''.join('<li><strong>%s</strong>: <a href="%s" rel="noopener">%s</a> (FR Doc. %s%s)</li>' % (esc(u['date']), esc(u['url']), esc(u['title']), esc(u['document_number']), ', on public inspection' if u['public_inspection'] else '') for u in updates)
        eff = [NOTICE_EFFECT[u['document_number']] for u in updates if u['document_number'] in NOTICE_EFFECT]
        if eff:
            upd_html = ('<div class="alert"><strong>Update: the dates on this page have moved.</strong> %s '
                        'So on 10 November 2026 these rates do not change. The rises in the table below now apply to entries on or after 10 January 2027, '
                        'unless USTR acts again; the text further down still describes the old 9 November dates and will be rewritten.<ul>%s</ul></div>'
                        % (' '.join(esc(e) for e in eff), li))
        else:
            upd_html = ('<div class="alert"><strong>New Federal Register notice since this page was written.</strong> It may extend or change the dates below. '
                        'Read it before relying on any row here; this page will be rewritten to match it.<ul>%s</ul></div>' % li)
    def row_html(r):
        if r['status'] == 'computed':
            before, after = pct(r['rate_before']), pct(r['rate_after'])
            if r.get('qualifier') == 'up_to': after = 'up to ' + after
            rise = r['rate_after'] - r['rate_before']
            chg = '+%s pts' % (('%.2f' % rise).rstrip('0').rstrip('.')) if abs(rise) > 0.005 else 'no change'
            if r.get('from_date') and r['from_date'] != '2026-11-10': chg += ' from ' + r['from_date']
        else:
            before, after, chg = 'not in the current schedule', 'check', '+%s pts on the list duty' % (('%.1f' % r['rise_pp']).rstrip('0').rstrip('.'))
        scope = ' <span class="tag">whole number</span>' if r.get('whole_number') else (' <span class="tag">only goods matching this description</span>' if r['kind'] == 'exclusion' else ' <span class="tag">scope: see note</span>')
        calc = '/tariffs/calculator?hts=%s&country=CN&utm_source=nov10page&utm_medium=organic&utm_campaign=tariffmonitor-202611-nov10&utm_content=row' % r['hts'].replace('.', '')
        return ('<tr data-k="%s"><td data-l="HTS"><a href="%s">%s</a></td><td data-l="Product">%s%s<div class="src">%s</div></td>'
                '<td data-l="Before 10 Nov">%s</td><td data-l="From 10 Nov">%s</td><td data-l="Change">%s</td></tr>') % (
            esc((r['hts'] + ' ' + r['description'] + ' ' + r['program']).lower()), esc(calc), esc(r['hts']), esc(r['description']), scope,
            esc(r['program'] + '; ' + r['source_note'] + ('; ' + r['adj'] if r.get('adj') else '')), esc(before), esc(after), esc(chg))
    mar = [r for r in rows if r['kind'] == 'maritime']; ex = [r for r in rows if r['kind'] == 'exclusion']
    trs = ''.join(row_html(r) for r in mar + ex)
    s = SRC
    title = 'What changes on 10 Nov 2026: HTS codes whose US duty rises'
    desc = ('On 10 Nov 2026 the 178 Section 301 China product exclusions end and the one-year suspension of the 100% maritime Section 301 duties on intermodal chassis and ship-to-shore cranes runs out, unless USTR extends them. Searchable list of affected HTS codes with rates.')
    ld = {'@context': 'https://schema.org', '@graph': [
        {'@type': 'Article', '@id': URL + '#article', 'headline': title, 'description': desc, 'url': URL, 'mainEntityOfPage': URL,
         'datePublished': '2026-11-03', 'dateModified': built[:10], 'inLanguage': 'en-US',
         'author': {'@type': 'Organization', 'name': '0xpi', 'url': 'https://0xpi.com'}, 'publisher': {'@type': 'Organization', 'name': '0xpi', 'url': 'https://0xpi.com'},
         'about': ['Section 301 tariffs on China', 'Harmonized Tariff Schedule of the United States', 'Section 301 product exclusions'],
         'citation': [{'@type': 'CreativeWork', 'name': v[0], 'url': v[1]} for v in s.values()]},
        {'@type': 'Dataset', '@id': URL + '#dataset', 'name': 'HTS codes whose US duty rises on 10 November 2026 (products of China)', 'description': 'Statistical reporting numbers named in the 178 Section 301 China product exclusions that end after 9 Nov 2026 (HTSUS ch. 99 U.S. note 20(vvv) and 20(www)) and the lines covered by headings 9903.91.12 and 9903.91.14 from 10 Nov 2026, with stacked-rate estimates from the Tariff Exposure Monitor engine. Estimates, not legal advice.',
         'url': URL, 'dateModified': built[:10], 'temporalCoverage': '2026-11-10/..', 'creator': {'@type': 'Organization', 'name': '0xpi', 'url': 'https://0xpi.com'},
         'isBasedOn': [s['ch99'][1], s['excl'][1], s['mar_action'][1], s['mar_susp'][1]], 'isAccessibleForFree': True,
         'distribution': [{'@type': 'DataDownload', 'encodingFormat': 'application/json', 'contentUrl': 'https://adcreator-ai.com/public/data/tariffs-november-10-2026.json'}]},
        {'@type': 'BreadcrumbList', 'itemListElement': [{'@type': 'ListItem', 'position': 1, 'name': 'Tariff calculator', 'item': 'https://adcreator-ai.com/tariffs/calculator'},
                                                         {'@type': 'ListItem', 'position': 2, 'name': 'What changes on 10 Nov 2026', 'item': URL}]}]}
    psalm = open(os.path.join(ROOT, 'scripts', 'psalm-snippet.html')).read().strip()
    a = lambda k: '<a href="%s" rel="noopener">%s</a>' % (esc(s[k][1]), esc(s[k][0]))
    return f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">{psalm}
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>What Changes on 10 Nov 2026: HTS Codes Whose Duty Rises</title>
<meta name="description" content="{esc(desc[:155].rsplit(' ', 1)[0])}">
<link rel="canonical" href="{URL}">
<meta property="og:title" content="{esc(title)}">
<meta property="og:description" content="{esc(desc)}">
<meta property="og:url" content="{URL}">
<meta property="og:type" content="article">
<meta property="article:modified_time" content="{built}">
<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){{dataLayer.push(arguments);}}window.__analyticsSuppressed=(function(){{try{{if(navigator.webdriver)return true;if(/HeadlessChrome|PhantomJS|Puppeteer|Playwright/i.test(navigator.userAgent||''))return true;}}catch(e){{}}return false;}})();if(!window.__analyticsSuppressed){{var g0=document.createElement('script');g0.async=true;g0.src='https://www.googletagmanager.com/gtag/js?id=G-RX4SNTPJX0';document.head.appendChild(g0);gtag("js",new Date());gtag("config","G-RX4SNTPJX0");gtag("config","G-2SPZG57P84");}}</script>
<script src="/public/js/utm-attribution.js" defer></script>
<script src="/public/js/engagement-track.js" defer></script>
<style>
:root{{--bg:#0a0e1a;--panel:#0f1729;--text:#e2e8f0;--muted:#94a3b8;--dim:#64748b;--amber:#f59e0b;--line:rgba(255,255,255,.08);--link:#a5b4fc}}
*{{box-sizing:border-box;margin:0;padding:0}}
html,body{{max-width:100%;overflow-x:hidden}}
body{{background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,system-ui,sans-serif;line-height:1.55}}
a{{color:var(--link)}}
.topbar{{padding:14px 16px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;gap:12px;max-width:1100px;margin:0 auto;flex-wrap:wrap}}
.topbar a{{color:var(--text);text-decoration:none;font-weight:700}}
.wrap{{max-width:1000px;margin:0 auto;padding:32px 16px 72px}}
h1{{font-size:clamp(26px,5vw,38px);line-height:1.15;letter-spacing:-.5px;margin-bottom:14px}}
h2{{font-size:22px;margin:36px 0 12px}}
p,li{{color:var(--text);font-size:16px;margin-bottom:10px}}
.muted{{color:var(--muted);font-size:14px}}
.answer{{background:var(--panel);border:1px solid var(--line);border-left:4px solid var(--amber);border-radius:10px;padding:18px;margin:18px 0}}
.answer li{{margin-left:20px}}
.alert{{background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.5);border-radius:10px;padding:14px 16px;margin:16px 0}}
.alert li{{margin-left:20px;font-size:15px}}
.cta{{display:inline-block;background:var(--amber);color:#111;font-weight:800;text-decoration:none;padding:13px 20px;border-radius:10px;margin:8px 0 4px}}
input[type=search]{{width:100%;padding:13px 14px;border-radius:10px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.05);color:var(--text);font-size:16px;margin:8px 0 10px}}
table{{width:100%;border-collapse:collapse;font-size:14px}}
th,td{{text-align:left;vertical-align:top;padding:9px 8px;border-bottom:1px solid var(--line);overflow-wrap:anywhere}}
th{{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.4px}}
td:first-child{{white-space:nowrap;font-family:Menlo,Monaco,monospace}}
.src{{color:var(--dim);font-size:12px;margin-top:3px}}
.tag{{display:inline-block;font-size:11px;color:var(--amber);border:1px solid rgba(245,158,11,.4);border-radius:6px;padding:0 5px;margin-left:4px}}
pre{{background:#060912;border:1px solid var(--line);border-radius:8px;padding:12px;overflow-x:auto;font-size:13px;white-space:pre-wrap;overflow-wrap:anywhere}}
code{{font-family:Menlo,Monaco,monospace;font-size:.92em}}
footer{{border-top:1px solid var(--line);margin-top:48px;padding-top:18px}}
@media(max-width:700px){{
 table,thead,tbody,tr,td{{display:block;width:100%}} thead{{display:none}}
 tr{{border:1px solid var(--line);border-radius:10px;margin-bottom:10px;padding:6px 10px}}
 td{{border:0;padding:4px 0}} td:first-child{{white-space:normal}}
 td[data-l]:before{{content:attr(data-l) ": ";color:var(--muted);font-size:12px;font-family:system-ui,sans-serif}}
}}
</style>
</head>
<body>
<div class="topbar"><a href="/tariffs/calculator">Tariff Exposure Monitor</a><a href="/tariffs/calculator" style="color:var(--muted);font-weight:600">Free tariff calculator</a></div>
<main class="wrap">
<h1>What changes on 10 Nov 2026: HTS codes whose US duty rises</h1>
{upd_html}
<div class="answer">
<p><strong>Short answer.</strong> Two Section 301 measures on products of China {'were' if passed else 'are'} set to end on the night of 9 to 10 November 2026, unless USTR extends them:</p>
<ul>
<li><strong>The 178 Section 301 product exclusions end.</strong> They run "through 11:59 p.m. eastern daylight time on November 9, 2026" ({a('excl')}). From 10 November, goods that used an exclusion pay the normal List 1, 2 or 3 duty (+25%) or List 4A duty (+7.5%) again.</li>
<li><strong>The one-year suspension of the maritime Section 301 action runs out.</strong> USTR suspended it "through 11:59 p.m. Eastern Standard Time on November 9, 2026" ({a('mar_susp')}). Chapter 99 headings 9903.91.12 (intermodal chassis and parts) and 9903.91.14 (ship-to-shore gantry cranes) add +100% for entries on or after 10 November 2026 ({a('mar_action')}; {a('ch99')}).</li>
</ul>
<p>Below: {n_ex_codes} statistical numbers named in the exclusions plus {len(mar)} chassis and crane lines, with today's estimated rate and the rate from 10 November.</p>
<a class="cta" href="/tariffs/calculator?utm_source=nov10page&amp;utm_medium=organic&amp;utm_campaign=tariffmonitor-202611-nov10&amp;utm_content=hero">Check your HTS code in the free calculator</a>
<p class="muted">Free, no signup. The calculator gives an estimate; the official rate is in the <a href="https://hts.usitc.gov/" rel="noopener">HTSUS</a>.</p>
</div>

<h2>Could the date move?</h2>
<p><strong>{'Yes. A new notice is listed at the top of this page; read it first.' if updates else 'Yes, both measures can be extended, and neither extension is final as of ' + esc(built[:10]) + '.'}</strong></p>
<ul>
<li><strong>Maritime duties (chassis, cranes):</strong> on 26 October 2026 USTR <em>proposed</em> suspending them for two more months, through 11:59 p.m. Eastern Time on 9 January 2027, and took comments until 30 October ({a('mar_rfc')}). A proposal is not a decision. If USTR publishes the final notice, the chassis and crane rows below will not rise on 10 November.</li>
<li><strong>Product exclusions:</strong> we found no Federal Register notice extending them beyond 9 November 2026. USTR has extended them several times before; the last extension was announced on 26 November 2025, three days before the earlier end date, and published in the Federal Register on 1 December 2025. That is history, not a forecast.</li>
</ul>
<p>This page checks the Federal Register every day. If a new notice appears, it is shown at the top of this page the same day.</p>

<h2>Search the affected HTS codes</h2>
<p class="muted">Products of China only. "Before 10 Nov" for an exclusion row is the estimated rate when the exclusion is claimed (heading 9903.88.69 or 9903.88.70). Many exclusions cover only goods matching a written description, not every product under the number; those rows are tagged. Rates are stacked estimates from our engine (MFN + Section 301 + Section 232 + the 2026 Section 301 forced-labor duty); built {esc(built)} from {esc(rev)}.</p>
<label for="q" class="muted">Filter by HTS number or product word</label>
<input type="search" id="q" placeholder="e.g. 8716, pump, 3926.90" autocomplete="off">
<p class="muted" id="cnt"></p>
<table><thead><tr><th>HTS</th><th>Product and source</th><th>Before 10 Nov</th><th>From 10 Nov</th><th>Change</th></tr></thead>
<tbody id="t">{trs}</tbody></table>

<h2>How the figures are worked out</h2>
<ul>
<li><strong>Exclusion rows:</strong> both figures are our engine's answers for a product of China: "Before 10 Nov" is its rate for an entry on 9 November with the exclusion claimed (for an exclusion limited to a written description, the rate for goods matching it), "From 10 Nov" its rate once the exclusion has ended. You get the same figures from the calculator and the MCP tools with a query date. "Not in the current schedule" means chapter 99 still names a statistical number that is no longer a line in the HTSUS revision shown above.</li>
<li><strong>Chassis and crane rows:</strong> headings 9903.91.12 and 9903.91.14 read "the duty provided in the applicable subheading + 100%". For the chassis lines, chapter 99 does not say how this combines with the List 3 duty they already pay, so "From 10 Nov" is labelled <em>up to</em>: both duties added. For ship-to-shore cranes, U.S. note 31(l)(i) says the +100% comes on top of the +25% under heading 9903.92.10, so that row is exact. Chassis means intermodal chassis, subassemblies and parts (U.S. note 31(k)(i)); dry van, refrigerated van and flatbed trailers are outside the scope. Crane rows cover ship-to-shore gantry cranes of China, with Chinese components, or made by a Chinese-owned company (U.S. note 31(l)); attested and grandfathered cranes fall under 9903.91.15 and 9903.91.16.</li>
<li>The IEEPA reciprocal and fentanyl tariffs are not in these figures: the government stopped collecting them on 24 February 2026, after the Supreme Court ruling.</li>
<li>These are estimates for planning, not a ruling. Confirm the classification and rate with CBP or a licensed customs broker.</li>
</ul>

<h2>Query any code from an AI agent (MCP) or the free endpoint</h2>
<p>The same engine is an MCP server, <a href="https://github.com/daleweaver1981/tariffmonitor-mcp" rel="noopener">tariffmonitor-mcp</a>. Its <code>calculate_tariff</code> tool returns the rate stack for one HTS code and origin, and states the 9 November exclusion end. <code>compare_origins</code> compares 2 to 8 countries.</p>
<p><strong>Free hosted endpoint, no key:</strong> <code>https://adcreator-ai.com/mcp-free</code> (Streamable HTTP; 25 tool calls per IP per day).</p>
<pre>claude mcp add --transport http tariffmonitor https://adcreator-ai.com/mcp-free</pre>
<p>Or run it locally with no limit: <code>npx -y tariffmonitor-mcp</code>. The full dataset on this page is also available as JSON: <a href="/public/data/tariffs-november-10-2026.json">tariffs-november-10-2026.json</a>.</p>

<h2>Primary sources</h2>
<ul>{''.join('<li><a href="%s" rel="noopener">%s</a></li>' % (esc(v[1]), esc(v[0])) for v in s.values())}</ul>
<footer><p class="muted">Built by 0xpi from the Federal Register and the USITC chapter 99 text. Last checked {esc(built)}. Not legal advice. <a href="https://0xpi.com/about">About 0xpi</a></p></footer>
</main>
<script>
(function(){{var q=document.getElementById('q'),rows=[].slice.call(document.querySelectorAll('#t tr')),c=document.getElementById('cnt');
function f(){{var v=(q.value||'').toLowerCase().trim(),vd=v.replace(/\\./g,''),n=0;rows.forEach(function(r){{var k=r.getAttribute('data-k'),ok=!v||k.indexOf(v)>-1||k.replace(/\\./g,'').indexOf(vd)>-1;r.style.display=ok?'':'none';if(ok)n++;}});c.textContent=n+' of '+rows.length+' rows';}}
q.addEventListener('input',f);var p=new URLSearchParams(location.search).get('q');if(p){{q.value=p;}}f();}})();
</script>
<script src="/js/fe.js" defer></script>
</body>
</html>
'''

def main():
    built = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    L = chapter99_text().split('\n')
    rev = verify_headings(L)
    excl = parse_exclusions(L)
    rows = build_rows(excl)
    updates = fr_updates()
    os.makedirs(OUT, exist_ok=True)
    data = {'built_at': built, 'source_revision': rev, 'page': URL, 'exclusion_entries': len(excl), 'fr_updates': updates,
            'sources': {k: {'name': v[0], 'url': v[1]} for k, v in SRC.items()},
            'notes': 'Products of China. Every rate is the Tariff Exposure Monitor engine answer (as_of 2026-11-09 and its cliff / maritime start-date rate). Chassis rows (9903.91.12) are an upper bound ("up to") because chapter 99 does not state how that heading combines with List 3; crane rows (9903.91.14) are exact because U.S. note 31(l)(i) stacks them on 9903.92.10.',
            'rows': rows}
    page = render(rows, rev, updates, built)
    hp, jp = os.path.join(OUT, 'tariffs-november-10-2026.html'), os.path.join(OUT, 'tariffs-november-10-2026.json')
    open(hp, 'w').write(page); json.dump(data, open(jp, 'w'), indent=1)
    sig = hashlib.sha256(json.dumps([rows, updates, rev], sort_keys=True).encode()).hexdigest()
    st = json.load(open(STATE)) if os.path.exists(STATE) else {}
    new_upd = [u for u in updates if u['document_number'] not in st.get('updates_seen', [])]
    print('rows %d (%d exclusion entries), statuses %s, fr updates %d (new %d), %s' % (len(rows), len(excl),
          {k: sum(1 for r in rows if r['status'] == k) for k in {r['status'] for r in rows}}, len(updates), len(new_upd), rev))
    if new_upd:
        due('TARIFF NOV10 NOTICE %s:' % built[:10], 'New USTR Federal Register notice(s) touching the 10 Nov 2026 page: ' + ' | '.join('%s FR Doc. %s "%s" %s' % (u['date'], u['document_number'], u['title'][:160], u['url']) for u in new_upd)
            + '. The page already shows them at the top; rewrite the affected rows/text in scripts/nov10-page.py (KNOWN_FR + wording) and redeploy.')
    if DEPLOY:
        for src, dst in ((hp, VM100_HTML), (jp, VM100_JSON)):
            subprocess.run(['scp', '-q', src, dst + '.tmp'], check=True)
            host, path = dst.split(':', 1)
            subprocess.run(['ssh', host, 'mv %s.tmp %s' % (path, path)], check=True)
        print('deployed to VM100')
        if sig != st.get('sig'):
            body = json.dumps({'host': 'adcreator-ai.com', 'key': INDEXNOW_KEY, 'keyLocation': 'https://adcreator-ai.com/%s.txt' % INDEXNOW_KEY, 'urlList': [URL]}).encode()
            try:
                with urllib.request.urlopen(urllib.request.Request('https://api.indexnow.org/indexnow', data=body, headers={'Content-Type': 'application/json; charset=utf-8'}), timeout=30) as r:
                    print('IndexNow', r.status)
            except Exception as e: print('IndexNow error', e)
        st.update(sig=sig, last_deploy=built)
    st['updates_seen'] = sorted(set(st.get('updates_seen', [])) | {u['document_number'] for u in updates})
    json.dump(st, open(STATE, 'w'), indent=1)

if __name__ == '__main__':
    main()
