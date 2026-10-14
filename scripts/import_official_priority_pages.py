"""Append the five reviewed official-source excerpts; never reload the dataset.

Run: python scripts/import_official_priority_pages.py
Re-running verifies the existing batch instead of creating duplicates.
"""
import hashlib
import json
import os
from pathlib import Path
import subprocess
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
IMPORT_ID = 'bharat-official-priority-2026-10-14-v1'


def convex(*args):
    result = subprocess.run(['npx.cmd' if os.name == 'nt' else 'npx', 'convex', *args],
                            cwd=ROOT, capture_output=True, text=True, encoding='utf-8')
    if result.returncode:
        raise RuntimeError(result.stdout + result.stderr)
    return result.stdout


def main():
    pages = json.loads((ROOT / 'data/official-priority-pages.json').read_text(encoding='utf-8'))['pages']
    assert len(pages) == 5
    assert {task for page in pages for task in page['taskIds']} == {18, 26, 27, 40, 69}
    rows = []
    for page in pages:
        host = urlsplit(page['url']).hostname
        if not page['url'].startswith('https://') or not host.endswith(('.gov.in', '.nic.in')):
            raise ValueError('Only reviewed official HTTPS sources can be imported.')
        text = page['text']
        if len(text) < 200 or any(s in text.lower() for s in ['access denied', 'web page blocked', 'enable javascript']):
            raise ValueError('Missing or blocked source content.')
        source_id = hashlib.sha256((page['url'] + '\0' + text).encode()).hexdigest()
        chunks = [text[i:i + 1000] for i in range(0, len(text), 1000)]
        assert ''.join(chunks) == text
        for index, chunk in enumerate(chunks):
            rows.append({'title': page['title'], 'text': chunk, 'url': page['url'], 'host': host,
                         'topics': page['topics'], 'sourceId': source_id, 'chunkIndex': index,
                         'chunkCount': len(chunks), 'importId': IMPORT_ID})
    existing = json.loads(convex('run', 'documentLoader:verify', json.dumps({'importId': IMPORT_ID})))
    if existing['rows']:
        if existing['rows'] != len(pages) or existing['chunks'] != len(rows):
            raise RuntimeError('An incomplete batch exists; stop before importing duplicates.')
        print('Already imported; verified five pages / six complete chunks.', flush=True)
        return
    inventory = json.loads(convex('run', 'documentLoader:inventory', '{}'))
    existing_urls = {s['url'].rstrip('/') for s in inventory['sources']}
    if any(p['url'].rstrip('/') in existing_urls for p in pages):
        raise RuntimeError('An official URL already exists; review its content before importing a duplicate.')
    before = json.loads(convex('run', 'storageCleanup:measure', '{}'))
    approximate_added_bytes = sum(len(json.dumps(row, ensure_ascii=False).encode()) + 200 for row in rows) * 5
    if not before['complete'] or before['databaseBytes'] + approximate_added_bytes + 1048576 >= 400 * 1048576:
        raise RuntimeError('The import would exceed the storage budget or existing chunks are incomplete.')
    path = ROOT / '.verification/official-priority-chunks.jsonl'
    path.write_text(''.join(json.dumps(row, ensure_ascii=False) + '\n' for row in rows), encoding='utf-8')
    print(f'Adding {len(pages)} official pages / {len(rows)} chunks; existing documents stay in place.', flush=True)
    print(convex('import', '--table', 'documents', '--append', str(path)), end='', flush=True)
    result = json.loads(convex('run', 'documentLoader:verify', json.dumps({'importId': IMPORT_ID})))
    if result['rows'] != len(pages) or result['chunks'] != len(rows):
        raise RuntimeError('Import verification failed.')
    after = json.loads(convex('run', 'storageCleanup:measure', '{}'))
    if not after['complete'] or after['chunks'] != before['chunks'] + len(rows) or after['documents'] != before['documents'] + len(pages):
        raise RuntimeError('Post-import counts or chunk integrity differ from the expected result.')
    (ROOT / '.verification/official-priority-import-result.json').write_text(json.dumps({'batch': result, 'before': before, 'after': after}, indent=2), encoding='utf-8')
    print('Verified Convex result: ' + json.dumps(after), flush=True)


if __name__ == '__main__':
    main()
