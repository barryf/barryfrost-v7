#!/usr/bin/env python3
"""One-off: normalise weeknote titles to the documented "Week {N} - {Topic}" form.

Weeks 1-46 were written as "Week {N}: {Topic}" (colon), weeks 47+ as "Week {N} - {Topic}"
(hyphen with surrounding spaces). PLAN.md documents the hyphen form as the convention, so
this rewrites the colon variants to match.

Only the frontmatter `title:` line is touched, and only when it matches the colon form
exactly. Body text and every other frontmatter key are left alone.

Files are read and written with newline="" so line endings survive byte-for-byte: most of
these weeknotes carry CRLF endings in the body, and the default universal-newline handling
would silently rewrite them all to LF.

Usage:  python3 scripts/normalise-weeknote-titles.py [--apply]
Without --apply it prints the changes it would make and writes nothing.
"""
import re
import sys
from pathlib import Path

WEEKNOTES = Path(__file__).resolve().parent.parent / "src" / "content" / "weeknotes"
TITLE_RE = re.compile(r'^(title: ")Week (\d+): (.*)("$)')

def main() -> int:
    apply = "--apply" in sys.argv
    changes = []

    for path in sorted(WEEKNOTES.glob("*.md*"), key=lambda p: int(p.stem)):
        with open(path, "r", encoding="utf-8", newline="") as fh:
            text = fh.read()
        lines = text.split("\n")
        for i, line in enumerate(lines):
            bare = line.rstrip("\r")
            # Frontmatter only: stop at the closing delimiter.
            if i > 0 and bare == "---":
                break
            m = TITLE_RE.match(bare)
            if not m:
                continue
            eol = "\r" if line.endswith("\r") else ""
            new = f'{m.group(1)}Week {m.group(2)} - {m.group(3)}"{eol}'
            changes.append((path, bare, new.rstrip("\r")))
            if apply:
                lines[i] = new
                with open(path, "w", encoding="utf-8", newline="") as fh:
                    fh.write("\n".join(lines))
            break

    for path, before, after in changes:
        print(f"{path.name}:\n  - {before}\n  + {after}")
    print(f"\n{len(changes)} file(s) {'rewritten' if apply else 'would change'}.")
    if not apply:
        print("Re-run with --apply to write.")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
