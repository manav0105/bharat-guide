"""Stream topic counts, then append bounded, deduplicated citizen documents."""
import argparse
from collections import Counter
import json
import os
from pathlib import Path
import sys
import time
import re
import tempfile
from urllib.parse import urlsplit

os.environ["HF_HUB_DISABLE_IMPLICIT_TOKEN"] = "1"
os.environ["HF_HUB_DISABLE_PROGRESS_BARS"] = "1"
os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"

from datasets import load_dataset
from huggingface_hub import HfApi
from load_government_documents import convex, is_good

DATASET = "ankitjh4/bharat-government-documents"
ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / ".verification"
TOPICS = ["public_services", "income_tax", "universities", "digital_infrastructure",
          "government_statements", "public_infrastructure"]
LIMIT = 1000


def count_topics():
    for attempt in range(5):
        try:
            revision = HfApi().dataset_info(DATASET, token=False).sha
            break
        except Exception as error:
            status = getattr(getattr(error, "response", None), "status_code", None)
            if status in (401, 403) or attempt == 4:
                raise
            print("Hugging Face connection dropped; retrying metadata lookup.", file=sys.stderr, flush=True)
            time.sleep(2 ** attempt)
    # Parquet column projection reads the labels without downloading bodies,
    # CSV archives, SQLite backups, or whole Parquet files.
    stream = load_dataset(DATASET, revision=revision, split="train", streaming=True,
                          token=False, columns=["topics"])
    counts = Counter()
    total = 0
    for row in stream:
        counts.update(set(row["topics"]))
        total += 1
        if total % 10000 == 0:
            print(f"Counted topics in {total} streamed rows", file=sys.stderr, flush=True)
    EVIDENCE.mkdir(exist_ok=True)
    summary = {"dataset": DATASET, "revision": revision, "rows": total,
               "topics": dict(sorted(counts.items()))}
    (EVIDENCE / "bharat-topic-counts.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    listing = "\n".join(f"{topic}: {count}" for topic, count in sorted(counts.items()))
    (EVIDENCE / "bharat-topic-counts.txt").write_text(listing + "\n", encoding="utf-8")
    print(listing, flush=True)
    print(f"Total streamed documents: {total}", flush=True)
    print(f"Dataset revision: {revision}", flush=True)


def inventory():
    return json.loads(convex("run", "documentLoader:inventory", "{}"))


def citizen_score(title, url):
    text = (title + " " + url).lower()
    # Prioritize practical citizen instructions over tenders, rosters, speeches,
    # old notices, and directory menus. All documents still need good quality.
    score = 0
    for phrase in ["voter", "electoral", "election", "aadhaar", "aadhar", "pan card",
                   "pan-card", "pan.htm", "passport", "income tax return", "income-tax-return",
                   "itr", "e-filing", "efiling", "address", "birth", "death", "certificate",
                   "land record", "property", "admission", "scholarship", "health insurance",
                   "patient", "treatment", "legal aid", "legal services", "consumer", "rights"]:
        if phrase in text:
            score += 20
    if re.search(r"faq|frequently|how.to|guide|procedure|application|form|citizen|service", text):
        score += 10
    if re.search(r"tender|vacanc|recruitment|roster|occupancy|contact.us|sitemap|accessibility", text):
        score -= 30
    return score


def plan_import():
    summary = json.loads((EVIDENCE / "bharat-topic-counts.json").read_text(encoding="utf-8"))
    current = inventory()
    import_id = f"bharat-citizen-{summary['revision']}-1000-v1"
    if any(batch["importId"] == import_id for batch in current["imports"]):
        path = EVIDENCE / "bharat-expansion-plan.json"
        if path.exists():
            saved = json.loads(path.read_text(encoding="utf-8"))
            if saved["importId"] == import_id and saved["topics"] == TOPICS:
                print("This expansion is already imported; reusing its original bounded plan.", flush=True)
                return
        raise RuntimeError("This snapshot already has an expansion import. Refusing to create a second quota or overwrite its plan.")
    (EVIDENCE / "bharat-inventory-before.json").write_text(json.dumps(current), encoding="utf-8")
    existing_ids = {source["sourceId"] for source in current["sources"]}
    existing_urls = {source["url"] for source in current["sources"]}
    candidates = []
    duplicates = 0
    stream = load_dataset(DATASET, revision=summary["revision"], split="train", streaming=True,
        token=False, columns=["content_hash", "document_id", "title", "url", "quality", "topics", "sources"])
    for ordinal, row in enumerate(stream):
        if not set(row["topics"]).intersection(TOPICS) or not is_good(row):
            continue
        if row["content_hash"] in existing_ids or row["url"] in existing_urls:
            duplicates += 1
            continue
        url = urlsplit(row["url"])
        if url.scheme not in ("http", "https") or not url.hostname:
            continue
        candidates.append({"sourceId": row["content_hash"], "title": row["title"], "url": row["url"],
            "topics": row["topics"], "score": citizen_score(row["title"], row["url"]), "ordinal": ordinal})
        if ordinal and ordinal % 10000 == 0:
            print(f"Reviewed {ordinal} streamed metadata rows", file=sys.stderr, flush=True)
    candidates.sort(key=lambda candidate: (-candidate["score"], candidate["ordinal"]))
    selected = []
    seen_ids, seen_urls = set(existing_ids), set(existing_urls)
    counts = Counter({topic: 0 for topic in TOPICS})
    # First reserve practical citizen instructions across the chosen labels,
    # so overlapping directories cannot exhaust a broad topic's quota first.
    for row in candidates:
        if row["score"] < 20 or row["sourceId"] in seen_ids or row["url"] in seen_urls:
            continue
        labels = set(row["topics"]).intersection(TOPICS)
        if any(counts[label] == LIMIT for label in labels):
            continue
        selected.append(row)
        seen_ids.add(row["sourceId"])
        seen_urls.add(row["url"])
        counts.update(labels)
    # Fill remaining space, starting with the rare categories. A multi-topic
    # document is stored once; no label can exceed 1,000 NEW records.
    for topic in sorted(TOPICS, key=lambda label: summary["topics"][label]):
        for row in candidates:
            if counts[topic] == LIMIT:
                break
            if topic not in row["topics"] or row["sourceId"] in seen_ids or row["url"] in seen_urls:
                continue
            labels = set(row["topics"]).intersection(TOPICS)
            if any(counts[label] == LIMIT for label in labels):
                continue
            selected.append(row)
            seen_ids.add(row["sourceId"])
            seen_urls.add(row["url"])
            counts.update(labels)
    plan = {"revision": summary["revision"], "topics": TOPICS, "counts": dict(counts),
        "duplicates_skipped": duplicates, "before_rows": current["rows"], "before_chunks": current["chunks"],
        "importId": import_id, "sources": selected}
    (EVIDENCE / "bharat-expansion-plan.json").write_text(json.dumps(plan, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Existing source documents: {current['rows']}", flush=True)
    print(f"Existing chunks: {current['chunks']}", flush=True)
    print(f"Duplicate source documents skipped: {duplicates}", flush=True)
    print(f"Unique new documents selected: {len(selected)}", flush=True)
    for topic in TOPICS:
        print(f"{topic}: {counts[topic]} new documents", flush=True)


def load_import():
    plan = json.loads((EVIDENCE / "bharat-expansion-plan.json").read_text(encoding="utf-8"))
    current = inventory()
    existing_ids = {source["sourceId"] for source in current["sources"]}
    existing_urls = {source["url"] for source in current["sources"]}
    targets = {row["sourceId"] for row in plan["sources"]
        if row["sourceId"] not in existing_ids and row["url"] not in existing_urls}
    staged_rows = staged_chunks = 0
    loaded = set()
    per_topic = Counter({topic: 0 for topic in TOPICS})
    if targets:
        stream = load_dataset(DATASET, revision=plan["revision"], split="train", streaming=True, token=False,
            filters=[("content_hash", "in", sorted(targets))])
        with tempfile.TemporaryDirectory(prefix="bharat-citizen-loader-") as directory:
            path = Path(directory) / "documents.jsonl"
            with path.open("w", encoding="utf-8") as output:
                for row in stream:
                    if row["content_hash"] not in targets or row["content_hash"] in loaded:
                        continue
                    if not is_good(row) or not isinstance(row["text"], str) or not row["text"]:
                        raise RuntimeError("Selected document has invalid quality or text. Nothing imported.")
                    parts = [row["text"][start:start + 1000] for start in range(0, len(row["text"]), 1000)]
                    assert "".join(parts) == row["text"]
                    for index, part in enumerate(parts):
                        document = {"title": row["title"], "text": part, "url": row["url"],
                            "host": urlsplit(row["url"]).hostname, "topics": row["topics"],
                            "sourceId": row["content_hash"], "chunkIndex": index,
                            "chunkCount": len(parts), "importId": plan["importId"]}
                        output.write(json.dumps(document, ensure_ascii=False) + "\n")
                    loaded.add(row["content_hash"])
                    staged_rows += 1
                    staged_chunks += len(parts)
                    per_topic.update(set(row["topics"]).intersection(TOPICS))
                    if staged_rows % 250 == 0:
                        print(f"Staged {staged_rows} new documents / {staged_chunks} chunks", flush=True)
                    if loaded == targets:
                        break
            if loaded != targets:
                raise RuntimeError("Some selected documents were absent. Nothing imported.")
            print(f"Appending {staged_rows} documents / {staged_chunks} chunks to Convex", flush=True)
            print(convex("import", "--table", "documents", "--append", str(path)), end="", flush=True)
    final = inventory()
    if final["rows"] != current["rows"] + staged_rows or final["chunks"] != current["chunks"] + staged_chunks:
        raise RuntimeError("Convex read-back totals do not match the append.")
    # Protect the original schemes import, including all of its chunk sequences.
    before = json.loads((EVIDENCE / "bharat-inventory-before.json").read_text(encoding="utf-8"))
    originals = {item["importId"]: item for item in before["imports"]}
    for item in final["imports"]:
        if item["importId"] in originals and item["importId"] != plan["importId"] and item != originals[item["importId"]]:
            raise RuntimeError("An existing import changed unexpectedly.")
    total_topic_counts = Counter({topic: 0 for topic in TOPICS})
    for source in final["sources"]:
        if source["importId"] == plan["importId"]:
            total_topic_counts.update(set(source["topics"]).intersection(TOPICS))
    if any(count > LIMIT for count in total_topic_counts.values()):
        raise RuntimeError("A topic exceeded the 1,000-document expansion limit.")
    report = {"rows": final["rows"], "chunks": final["chunks"], "imports": final["imports"],
        "new_rows": final["rows"] - before["rows"], "new_chunks": final["chunks"] - before["chunks"],
        "new_documents_by_topic": dict(total_topic_counts)}
    (EVIDENCE / "bharat-expansion-result.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Final source documents saved in Convex: {final['rows']}", flush=True)
    print(f"Final chunks saved in Convex: {final['chunks']}", flush=True)
    for topic in TOPICS:
        print(f"{topic}: {total_topic_counts[topic]} new documents", flush=True)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["count", "plan", "load"])
    args = parser.parse_args()
    {"count": count_topics, "plan": plan_import, "load": load_import}[args.command]()
