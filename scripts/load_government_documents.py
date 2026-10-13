"""One-time, bounded streaming import. Never downloads the full dataset.

Install: python -m pip install -r scripts/loader-requirements.txt
Preview: python scripts/load_government_documents.py --preview
Import:  python scripts/load_government_documents.py
"""
import argparse
import itertools
import json
import os
import sys
import subprocess
import tempfile
import traceback
from pathlib import Path
from urllib.parse import urlsplit

# Explicitly forbid using a cached or environment-provided Hugging Face token.
os.environ["HF_HUB_DISABLE_IMPLICIT_TOKEN"] = "1"
os.environ["HF_HUB_DISABLE_PROGRESS_BARS"] = "1"
os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"

from datasets import load_dataset

DATASET = "ankitjh4/bharat-government-documents"
REVISION = "1b76e58adbb0a69e113e27626a15b97d039d897e"
ROOT = Path(__file__).resolve().parents[1]
IMPORT_ID = f"bharat-schemes-{REVISION}-2000-v1"
LIMIT = 2000


def convex(*arguments):
    command = "npx.cmd" if os.name == "nt" else "npx"
    # Convex CLI insists on a project dependency entry. Keep this loader-only
    # requirement temporary so the app's package files stay byte-for-byte intact.
    package_path = ROOT / "package.json"
    original_package = package_path.read_bytes()
    package = json.loads(original_package)
    needs_entry = "convex" not in package.get("dependencies", {})
    try:
        if needs_entry:
            package.setdefault("dependencies", {})["convex"] = "1.46.0"
            package_path.write_text(json.dumps(package), encoding="utf-8")
        result = subprocess.run(
            [command, "--yes", "convex@1.46.0", *arguments], cwd=ROOT,
            capture_output=True, text=True, encoding="utf-8", errors="replace",
        )
    finally:
        if needs_entry:
            package_path.write_bytes(original_package)
    if result.returncode:
        print(result.stdout, end="", flush=True)
        print(result.stderr, end="", file=sys.stderr, flush=True)
        raise RuntimeError("Convex command failed; inspect the output above.")
    return result.stdout


def verify():
    return json.loads(convex("run", "documentLoader:verify", json.dumps({"importId": IMPORT_ID})))


def report(result):
    print(f"Rows saved in Convex: {result['rows']}", flush=True)
    print(f"Chunks saved in Convex: {result['chunks']}", flush=True)
    for index, sample in enumerate(result["samples"], 1):
        print(f"Sample {index} title: {sample['title']}", flush=True)
        print(f"Sample {index} URL: {sample['url']}", flush=True)


def is_good(row):
    # In this pinned Parquet release, good CSV records are represented by
    # full_text/ocr_text plus an eligible assessment. There is no 'good' value
    # in the quality column. Confirm the canonical source, not a reviewed alias.
    return row["quality"] in ("full_text", "ocr_text") and any(
        source["document_id"] == row["document_id"]
        and source.get("assessment_status") == "eligible"
        for source in row["sources"]
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--preview", action="store_true")
    args = parser.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")
    stream = iter(load_dataset(
        DATASET, revision=REVISION, split="train", streaming=True, token=False,
    ))
    first = list(itertools.islice(stream, 5))
    if len(first) != 5:
        raise RuntimeError("Dataset did not provide five preview rows.")
    print("STEP 1", flush=True)
    for number, row in enumerate(first, 1):
        print(f"Row {number} columns: {json.dumps(list(row))}", flush=True)
    print("Sample row: " + json.dumps(first[0], ensure_ascii=False), flush=True)
    if args.preview:
        return
    existing = verify()
    if existing["chunks"]:
        if existing["rows"] != LIMIT:
            raise RuntimeError("An incomplete import exists. Refusing to append duplicates.")
        report(existing)
        return
    kept = chunks = scanned = 0
    seen = set()
    # Only the selected 2,000 documents are staged; remote Parquet stays remote.
    with tempfile.TemporaryDirectory(prefix="bharat-loader-") as directory:
        path = Path(directory) / "documents.jsonl"
        with path.open("w", encoding="utf-8") as output:
            for row in itertools.chain(first, stream):
                scanned += 1
                # 'schemes' is this release's label for schemes and benefits.
                if "schemes" not in row["topics"] or not is_good(row):
                    continue
                source_id = row["content_hash"]
                if source_id in seen:
                    continue
                text = row["text"]
                if not isinstance(text, str) or not text:
                    raise RuntimeError("Approved row has empty or invalid text.")
                parts = [text[start:start + 1000] for start in range(0, len(text), 1000)]
                assert "".join(parts) == text
                host = row.get("host") or urlsplit(row["url"]).hostname
                if not host:
                    raise RuntimeError("Document URL has no host.")
                for index, part in enumerate(parts):
                    document = {
                        "title": row["title"], "text": part, "url": row["url"],
                        "host": host, "topics": row["topics"], "sourceId": source_id,
                        "chunkIndex": index, "chunkCount": len(parts), "importId": IMPORT_ID,
                    }
                    output.write(json.dumps(document, ensure_ascii=False) + "\n")
                kept += 1
                chunks += len(parts)
                seen.add(source_id)
                if kept % 250 == 0:
                    print(f"Selected {kept} rows / {chunks} chunks; scanned {scanned} rows", flush=True)
                if kept == LIMIT:
                    break
        if kept != LIMIT:
            raise RuntimeError(f"Only {kept} qualifying rows found; nothing imported.")
        print("Importing selected chunks into Convex...", flush=True)
        print(convex("import", "--table", "documents", "--append", str(path)), end="", flush=True)
        result = verify()
        if (result["rows"], result["chunks"]) != (kept, chunks):
            raise RuntimeError("Convex read-back counts do not match the staged import.")
        report(result)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        name = type(error).__name__
        status = getattr(getattr(error, "response", None), "status_code", None)
        if status in (401, 403) or "Gated" in name:
            print("STOP: Hugging Face requested authentication. No token was used or printed.", file=sys.stderr)
        else:
            traceback.print_exc()
        sys.exit(1)
