from __future__ import annotations

import os
import shutil
import stat
import sys
import zipfile
from pathlib import Path, PurePosixPath

ARCHIVE = Path("HealthThread Memory-2.zip")
ROOT = Path.cwd().resolve()
PROTECTED_PREFIXES = (
    PurePosixPath(".git"),
    PurePosixPath(".github/workflows"),
)
PROTECTED_FILES = {
    PurePosixPath("scripts/extract_source.py"),
    PurePosixPath(".github/workflows/extract-source.yml"),
}


def fail(message: str) -> None:
    print(f"::error::{message}", file=sys.stderr)
    raise SystemExit(1)


def normalized_member(name: str) -> PurePosixPath | None:
    normalized = name.replace("\\", "/")
    path = PurePosixPath(normalized)
    if not normalized or normalized.endswith("/"):
        return None
    if path.is_absolute() or ".." in path.parts:
        fail(f"Unsafe archive path: {name}")
    if any(part in {"", "."} for part in path.parts):
        fail(f"Non-canonical archive path: {name}")
    return path


def is_symlink(info: zipfile.ZipInfo) -> bool:
    mode = info.external_attr >> 16
    return stat.S_ISLNK(mode)


def strip_common_directory(paths: list[PurePosixPath]) -> list[PurePosixPath]:
    first_parts = {path.parts[0] for path in paths if path.parts}
    if len(first_parts) != 1 or any(len(path.parts) < 2 for path in paths):
        return paths
    return [PurePosixPath(*path.parts[1:]) for path in paths]


def is_protected(path: PurePosixPath) -> bool:
    if path in PROTECTED_FILES:
        return True
    return any(path == prefix or prefix in path.parents for prefix in PROTECTED_PREFIXES)


def safe_destination(path: PurePosixPath) -> Path:
    destination = (ROOT / Path(*path.parts)).resolve()
    try:
        destination.relative_to(ROOT)
    except ValueError:
        fail(f"Archive member escapes repository root: {path}")
    return destination


def main() -> None:
    if not ARCHIVE.exists():
        print("Archive already removed; nothing to extract.")
        return

    with zipfile.ZipFile(ARCHIVE) as archive:
        files: list[tuple[zipfile.ZipInfo, PurePosixPath]] = []
        raw_paths: list[PurePosixPath] = []
        for info in archive.infolist():
            path = normalized_member(info.filename)
            if path is None:
                continue
            if is_symlink(info):
                fail(f"Symbolic links are not allowed: {info.filename}")
            raw_paths.append(path)
            files.append((info, path))

        if not files:
            fail("Archive contains no files.")

        stripped_paths = strip_common_directory(raw_paths)
        if len(stripped_paths) != len(files):
            fail("Internal extraction bookkeeping mismatch.")

        written: list[str] = []
        skipped: list[str] = []
        for (info, _), path in zip(files, stripped_paths, strict=True):
            if is_protected(path):
                skipped.append(str(path))
                continue
            destination = safe_destination(path)
            destination.parent.mkdir(parents=True, exist_ok=True)
            with archive.open(info) as source, destination.open("wb") as target:
                shutil.copyfileobj(source, target)
            written.append(str(path))

    if not any((ROOT / candidate).exists() for candidate in ("package.json", "pyproject.toml", "requirements.txt")):
        fail("Extraction did not produce a recognized project manifest.")

    ARCHIVE.unlink()
    print(f"Extracted {len(written)} files and removed {ARCHIVE.name}.")
    if skipped:
        print("Skipped protected archive entries:")
        for path in skipped:
            print(f"- {path}")


if __name__ == "__main__":
    main()
