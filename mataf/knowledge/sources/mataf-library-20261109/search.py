#!/usr/bin/env python3
"""Offline page-level source search. Python 3 standard library only."""
import argparse, hashlib, json, re, sqlite3, unicodedata
from pathlib import Path
ROOT = Path(__file__).resolve().parent

def normalize(text):
    text = unicodedata.normalize('NFKC', text)
    return re.sub('[\u0591-\u05bd\u05bf-\u05c7\u200e\u200f\u202a-\u202e]', '', text)

def build():
    registry = json.loads((ROOT/'catalog/sources.json').read_text())
    db = sqlite3.connect(ROOT/'search.sqlite')
    db.executescript('DROP TABLE IF EXISTS pages; DROP TABLE IF EXISTS search; CREATE TABLE pages(id INTEGER PRIMARY KEY, source_id TEXT, page INTEGER, text TEXT); CREATE VIRTUAL TABLE search USING fts5(text, content=pages, content_rowid=id, tokenize="unicode61");')
    for s in registry:
        if not s.get('text_path'): continue
        for n, text in enumerate((ROOT/s['text_path']).read_text().split('\f'), 1):
            text = normalize(text).strip()
            if not text: continue
            cur = db.execute('INSERT INTO pages(source_id,page,text) VALUES (?,?,?)', (s['id'], n, text))
            db.execute('INSERT INTO search(rowid,text) VALUES (?,?)', (cur.lastrowid, text))
    db.commit()
    print('Indexed pages:', db.execute('SELECT count(*) FROM pages').fetchone()[0])
    db.close()

def verify():
    rows = json.loads((ROOT/'catalog/checksums.json').read_text())
    bad = []
    for name, expected in rows.items():
        p = ROOT/name
        if not p.exists() or hashlib.sha256(p.read_bytes()).hexdigest() != expected: bad.append(name)
    print('FAIL: '+', '.join(bad) if bad else 'OK: '+str(len(rows))+' file hashes match')
    return bool(bad)

def search(query, limit):
    registry = {s['id']:s for s in json.loads((ROOT/'catalog/sources.json').read_text())}
    terms = re.findall(r'\w+', normalize(query), re.UNICODE)
    if not terms: return
    if not (ROOT/'search.sqlite').exists(): build()
    db = sqlite3.connect('file:'+str(ROOT/'search.sqlite')+'?mode=ro', uri=True)
    q = ' AND '.join('"'+t+'"' for t in terms)
    rows = db.execute('SELECT p.source_id,p.page,p.text FROM search JOIN pages p ON p.id=search.rowid WHERE search MATCH ? ORDER BY bm25(search) LIMIT ?', (q,limit)).fetchall()
    print('Matches:', len(rows), '| Exact tokens; Hebrew inflection/synonyms are not expanded.')
    for sid, page, text in rows:
        s = registry[sid]
        lines = text.splitlines()
        found = [i for i,line in enumerate(lines) if any(t in line for t in terms)]
        excerpt = '\n'.join('\n'.join(lines[max(0,i-1):i+2]) for i in found[:2]) or text[:400]
        print('\n'+s['title']+' | PDF page '+str(page))
        print('סוג: '+s.get('source_class_he','לא סווג')+' | הטקסט: '+s.get('text_class_he','לא סווג'))
        print('אימות: '+s['verification'])
        print(s['url'])
        print('Local PDF:', s['pdf_path'] or (s.get('pdf_archive','')+' :: '+s.get('pdf_archive_member','')))
        print(excerpt)
    db.close()

if __name__ == '__main__':
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('query', nargs='?')
    ap.add_argument('--build', action='store_true')
    ap.add_argument('--verify', action='store_true')
    ap.add_argument('--limit', type=int, default=5)
    a=ap.parse_args()
    if a.build: build()
    if a.verify: raise SystemExit(verify())
    if a.query: search(a.query, max(1,min(50,a.limit)))
    elif not a.build: ap.print_help()
