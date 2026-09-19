#!/usr/bin/env python3
"""Check that relative markdown links in *.md resolve.

Coverage: inline link/image destinations `](target)` — including targets
with one level of balanced parentheses — and reference-style definitions
(`[label]: target`). External URLs (http/https/mailto/ftp), absolute paths,
and pure anchors are skipped; fenced code blocks are ignored (a `](...)`
shown as an example must not fail the check). Anchor fragments are not
validated. Exits 1 on broken links.

Known limitations (deliberate, stdlib-only):
- Indented (4-space) code blocks are NOT skipped: in this repo, 4-space-
  indented lines are list continuations that contain real links, so skipping
  them would hide genuine breakage. Show link examples in fences instead.
- Fences follow CommonMark closing rules (same character, at least the
  opening length, nothing else on the line); a truly unbalanced fence
  therefore skips to end of that file.

Usage: python3 scripts/check-links.py [--root DIR]
"""

import argparse
import re
import sys
import urllib.parse
from pathlib import Path

INLINE_RE = re.compile(r"\]\(((?:[^()\s]|\([^()]*\))+)(?:\s+\"[^\"]*\")?\)")
REFDEF_RE = re.compile(r"^\s{0,3}\[[^\]]+\]:\s+<?([^\s>]+)>?(?:\s+\"[^\"]*\")?\s*$")
FENCE_OPEN_RE = re.compile(r"^(`{3,}|~{3,})")
SKIP_SCHEMES = ("http:", "https:", "mailto:", "ftp:")


def extract_targets(line):
    targets = [m.group(1) for m in INLINE_RE.finditer(line)]
    refdef = REFDEF_RE.match(line)
    if refdef:
        targets.append(refdef.group(1))
    return targets


def check_file(path):
    broken = []
    fence = None  # (char, opening_length) while inside a fenced block
    text = path.read_text(encoding="utf-8", errors="replace")
    for lineno, line in enumerate(text.splitlines(), 1):
        stripped = line.lstrip()
        if fence is not None:
            ch, ln = fence
            close = stripped.strip()
            if close and set(close) == {ch} and len(close) >= ln:
                fence = None
            continue
        opened = FENCE_OPEN_RE.match(stripped)
        if opened:
            fence = (opened.group(1)[0], len(opened.group(1)))
            continue
        for target in extract_targets(line):
            t = target.strip()
            if t.startswith("<") and t.endswith(">"):
                t = t[1:-1]
            if t.startswith(SKIP_SCHEMES) or t.startswith("/"):
                continue
            t = t.split("#", 1)[0]
            if not t:
                continue
            if not (path.parent / urllib.parse.unquote(t)).exists():
                broken.append((lineno, target))
    return broken


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--root",
        type=Path,
        default=Path(__file__).resolve().parent.parent,
        help="repo root to scan (default: the repo containing this script)",
    )
    args = parser.parse_args()
    root = args.root.resolve()
    failures = 0
    for md in sorted(root.rglob("*.md")):
        if ".git" in md.parts:
            continue
        for lineno, target in check_file(md):
            print(f"BROKEN {md.relative_to(root)}:{lineno} -> {target}")
            failures += 1
    if failures:
        print(f"{failures} broken link(s)")
        return 1
    print("all relative markdown links resolve (inline + reference-style; fenced code skipped)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
