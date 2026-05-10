#!/usr/bin/env python3
"""Rewrite relative parent imports in src/ to use the @/ path alias."""

import os
import re
from pathlib import Path

SRC = Path(__file__).parent.parent / 'src'

IMPORT_RE = re.compile(r"(from ')(\.\.[^']+)(')")


def to_alias(file_path: Path, import_path: str):
    """Convert a relative import to an @/ alias, or None if outside src/."""
    file_dir_rel = file_path.parent.relative_to(SRC)
    combined = os.path.normpath(os.path.join(str(file_dir_rel), import_path))
    if combined.startswith('..'):
        return None
    return f'@/{combined}'


def process(file_path: Path):
    original = file_path.read_text()

    def replace(m):
        prefix, import_path, suffix = m.groups()
        alias = to_alias(file_path, import_path)
        return f"{prefix}{alias}{suffix}" if alias else m.group(0)

    updated = IMPORT_RE.sub(replace, original)
    if updated != original:
        file_path.write_text(updated)
        print(f"  {file_path.relative_to(SRC.parent)}")


extensions = {'.astro', '.ts', '.tsx'}
for root, dirs, files in os.walk(SRC):
    dirs[:] = [d for d in dirs if d != 'node_modules']
    for fname in files:
        if Path(fname).suffix in extensions:
            process(Path(root) / fname)
