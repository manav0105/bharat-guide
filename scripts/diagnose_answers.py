"""Admin-only tracing through the same Convex action used by the live site."""
import argparse
import hashlib
import json
import secrets
import sys
from pathlib import Path
from load_government_documents import convex

QUESTIONS = [
    "schemes for farmers",
    "health insurance for poor families",
    "scholarship for girl students",
]


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser()
    parser.add_argument("stage", choices=["before", "after"])
    args = parser.parse_args()
    directory = Path(__file__).resolve().parents[1] / ".verification"
    directory.mkdir(exist_ok=True)
    token_hash = hashlib.sha256(secrets.token_bytes(32)).hexdigest()
    convex("run", "questions:visitor", json.dumps({"tokenHash": token_hash, "create": True}))
    records = []
    output = []
    questions = QUESTIONS + (["How do I apply for a passport?"] if args.stage == "after" else [])
    for question in questions:
        result = json.loads(convex("run", "ai:answer", json.dumps({
            "question": question, "tokenHash": token_hash, "diagnostics": True,
        })))
        if result["error"]:
            raise RuntimeError(f"Answer failed: {result['error']}")
        records.append({"question": question, **result})
        output.append(f"Question: {question}")
        if args.stage == "before":
            chunks = result["diagnostics"]["chunks"]
            output.append(f"Search returned {len(chunks)} chunks:")
            for index, chunk in enumerate(chunks, 1):
                output.append(f"Chunk {index}: " + json.dumps({
                    "title": chunk["title"], "url": chunk["url"], "first200": chunk["text"][:200],
                }, ensure_ascii=False))
            raw = result["diagnostics"]["rawReply"]
            output.append("AI raw reply:")
            output.append(raw if raw is not None else "(AI was not called: no chunks)")
            output.append("Finish reason: " + str(result["diagnostics"]["finishReason"]))
        output.append("Answer: " + result["answer"])
        output.append("Sources: " + json.dumps(result["sources"], ensure_ascii=False))
        output.append("")
        # Persist immediately so a subsequent failure does not lose evidence.
        (directory / f"bharat-diagnosis-{args.stage}.json").write_text(
            json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8",
        )
        (directory / f"bharat-diagnosis-{args.stage}.txt").write_text("\n".join(output), encoding="utf-8")
        print("\n".join(output[len(output) - (len(chunks) + 8 if args.stage == 'before' else 4):]), flush=True)


if __name__ == "__main__":
    main()
