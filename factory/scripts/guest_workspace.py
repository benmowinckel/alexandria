#!/usr/bin/env python3
"""Create and operate a structurally isolated Git workspace for one guest AI."""

from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import stat
import subprocess
import sys
import tempfile
from pathlib import Path, PurePosixPath


MAX_BYTES = 1_000_000
NAME_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,47}$")


def die(message: str) -> "NoReturn":
    raise SystemExit(f"guest-workspace: {message}")


def run(*args: str, cwd: Path | None = None, capture: bool = False) -> str:
    result = subprocess.run(
        args,
        cwd=cwd,
        check=False,
        text=True,
        stdout=subprocess.PIPE if capture else None,
        stderr=subprocess.PIPE if capture else None,
    )
    if result.returncode:
        detail = (result.stderr or "").strip()
        die(f"command failed: {' '.join(args)}{': ' + detail if detail else ''}")
    return (result.stdout or "").strip()


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def safe_name(raw: str) -> str:
    if not NAME_RE.fullmatch(raw):
        die("name must use lowercase letters, numbers, or hyphens (48 characters maximum)")
    return raw


def alex_dir() -> Path:
    return Path(os.environ.get("ALEXANDRIA_DIR", "~/alexandria")).expanduser().resolve()


def state_dir(root: Path) -> Path:
    return root / "system" / "guest-workspaces"


def permission_path(root: Path, name: str) -> Path:
    return root / "system" / "permissions" / f"guest-{name}"


def state_path(root: Path, name: str) -> Path:
    return state_dir(root) / f"{name}.json"


def validate_relative(raw: str, label: str) -> PurePosixPath:
    path = PurePosixPath(raw)
    if not raw or path.is_absolute() or ".." in path.parts or "." in path.parts:
        die(f"unsafe {label}: {raw!r}")
    if any(part.startswith(".") for part in path.parts):
        die(f"hidden {label} is not allowed: {raw!r}")
    return path


def read_text_file(path: Path, label: str) -> str:
    try:
        info = path.lstat()
    except FileNotFoundError:
        die(f"missing {label}: {path}")
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISREG(info.st_mode):
        die(f"{label} must be a regular, non-symlink file: {path}")
    if info.st_size > MAX_BYTES:
        die(f"{label} exceeds {MAX_BYTES} bytes: {path}")
    data = path.read_bytes()
    if b"\x00" in data:
        die(f"{label} is binary: {path}")
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError:
        die(f"{label} is not UTF-8 text: {path}")


def reject_symlink_components(base: Path, relative: PurePosixPath, label: str) -> None:
    current = base
    for part in relative.parts:
        current = current / part
        try:
            if stat.S_ISLNK(current.lstat().st_mode):
                die(f"{label} crosses a symlink: {current}")
        except FileNotFoundError:
            die(f"missing {label}: {current}")


def parse_allowlist(root: Path, allowlist: Path) -> tuple[str, list[dict[str, str]]]:
    allowlist = allowlist.expanduser().resolve()
    raw = allowlist.read_bytes() if allowlist.is_file() else die(f"missing allowlist: {allowlist}")
    digest = sha256_bytes(raw)
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        die("allowlist must be UTF-8 text")

    rows: list[dict[str, str]] = []
    destinations: set[str] = set()
    files_root = (root / "files").resolve()
    for number, line in enumerate(text.splitlines(), start=1):
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        fields = line.split("\t")
        if len(fields) != 2:
            die(f"allowlist line {number} must be: source<TAB>context/destination")
        source_rel = validate_relative(fields[0].strip(), "source path")
        destination_rel = validate_relative(fields[1].strip(), "destination path")
        if not destination_rel.parts or destination_rel.parts[0] != "context":
            die(f"destination must stay under context/: {destination_rel}")
        source_lexical = root / Path(*source_rel.parts)
        source = source_lexical.resolve()
        try:
            source.relative_to(files_root)
        except ValueError:
            die(f"source must stay under {files_root}: {source_rel}")
        if not source_rel.parts or source_rel.parts[0] != "files":
            die(f"source must stay under files/: {source_rel}")
        reject_symlink_components(root / "files", PurePosixPath(*source_rel.parts[1:]), "selected context")
        content = read_text_file(source_lexical, "selected context")
        destination = destination_rel.as_posix()
        if destination in destinations:
            die(f"duplicate destination: {destination}")
        destinations.add(destination)
        rows.append(
            {
                "source": source_rel.as_posix(),
                "destination": destination,
                "sha256": sha256_bytes(content.encode("utf-8")),
            }
        )
    if not rows:
        die("allowlist selects no files")
    return digest, rows


def expected_manifest(rows: list[dict[str, str]]) -> str:
    return "".join(
        f"{row['sha256']}\t{row['source']}\t{row['destination']}\n" for row in rows
    )


def selection_digest(rows: list[dict[str, str]]) -> str:
    return sha256_bytes(expected_manifest(rows).encode("utf-8"))


def copy_context(root: Path, repo: Path, rows: list[dict[str, str]]) -> None:
    context = repo / "context"
    if context.exists():
        shutil.rmtree(context)
    context.mkdir(parents=True)
    for row in rows:
        source = root / Path(*PurePosixPath(row["source"]).parts)
        destination = repo / Path(*PurePosixPath(row["destination"]).parts)
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(read_text_file(source, "selected context"), encoding="utf-8")
    (repo / "CONTEXT.manifest").write_text(expected_manifest(rows), encoding="utf-8")


def write_json_atomic(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2, sort_keys=True)
            handle.write("\n")
        os.chmod(temporary, 0o600)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def load_state(root: Path, name: str) -> dict:
    path = state_path(root, name)
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        die(f"no active workspace named {name}")
    if payload.get("name") != name:
        die("workspace state does not match its name")
    return payload


def require_approval(root: Path, name: str, digest: str) -> None:
    permission = permission_path(root, name)
    approved = permission.read_text(encoding="utf-8").strip() if permission.is_file() else ""
    if approved != digest:
        die(
            "exact selected bytes are not approved; after the Author reviews `plan`, write its "
            f"selection SHA-256 to {permission}"
        )


def assert_clean_repo(repo: Path) -> None:
    if not (repo / ".git").exists():
        die(f"not an Alexandria guest repository: {repo}")
    if run("git", "status", "--porcelain", cwd=repo, capture=True):
        die("guest repository has uncommitted files; commit or discard them before continuing")


def plan(name: str, allowlist: Path) -> None:
    root = alex_dir()
    allowlist_digest, rows = parse_allowlist(root, allowlist)
    print(f"guest: {name}")
    print(f"allowlist sha256: {allowlist_digest}")
    print(f"selection sha256: {selection_digest(rows)}")
    for row in rows:
        print(f"{row['source']} -> {row['destination']} ({row['sha256']})")
    print("writes return only through inbox/ as untrusted captures")


def enable(name: str, allowlist: Path, repo: Path) -> None:
    root = alex_dir()
    allowlist_digest, rows = parse_allowlist(root, allowlist)
    selected_digest = selection_digest(rows)
    require_approval(root, name, selected_digest)
    repo = repo.expanduser().resolve()
    if repo.exists():
        die(f"destination already exists; a guest workspace must start fresh: {repo}")
    if state_path(root, name).exists():
        die(f"workspace state already exists for {name}; use status or off")

    temporary = repo.with_name(f".{repo.name}.building-{os.getpid()}")
    if temporary.exists():
        die(f"temporary destination already exists: {temporary}")
    temporary.mkdir(parents=True)
    try:
        (temporary / "inbox").mkdir()
        (temporary / "inbox" / ".gitkeep").write_text("", encoding="utf-8")
        (temporary / "README.md").write_text(
            f"# Alexandria guest workspace: {name}\n\n"
            "`context/` is selected read-only context. Write proposed work only under `inbox/`.\n\n"
            "Nothing here is canonical. The owner reviews every inbox file before it can enter Alexandria.\n",
            encoding="utf-8",
        )
        copy_context(root, temporary, rows)
        run("git", "init", "-b", "main", cwd=temporary)
        run("git", "add", "README.md", "CONTEXT.manifest", "context", "inbox", cwd=temporary)
        run(
            "git",
            "-c",
            "commit.gpgsign=false",
            "-c",
            "user.name=Alexandria",
            "-c",
            "user.email=local@alexandria",
            "commit",
            "-m",
            "Create isolated guest workspace",
            cwd=temporary,
        )
        os.replace(temporary, repo)
    except BaseException:
        shutil.rmtree(temporary, ignore_errors=True)
        raise

    head = run("git", "rev-parse", "HEAD", cwd=repo, capture=True)
    state = {
        "active": True,
        "allowlist": str(allowlist.expanduser().resolve()),
        "allowlist_sha256": allowlist_digest,
        "export_commit": head,
        "imports": {},
        "name": name,
        "repo": str(repo),
        "selection_sha256": selected_digest,
    }
    write_json_atomic(state_path(root, name), state)
    print(f"ready: {repo}")
    print("no remote or agent credential was created")


def active_workspace(name: str) -> tuple[Path, dict, Path]:
    root = alex_dir()
    state = load_state(root, name)
    if not state.get("active"):
        die(f"workspace {name} is off")
    require_approval(root, name, state["selection_sha256"])
    repo = Path(state["repo"]).resolve()
    assert_clean_repo(repo)
    return root, state, repo


def refresh(name: str) -> None:
    root = alex_dir()
    state = load_state(root, name)
    if not state.get("active"):
        die(f"workspace {name} is off")
    repo = Path(state["repo"]).resolve()
    assert_clean_repo(repo)
    allowlist = Path(state["allowlist"])
    allowlist_digest, rows = parse_allowlist(root, allowlist)
    selected_digest = selection_digest(rows)
    require_approval(root, name, selected_digest)
    copy_context(root, repo, rows)
    allowed = {"CONTEXT.manifest"}
    changed = run("git", "status", "--porcelain", cwd=repo, capture=True).splitlines()
    for line in changed:
        path = line[3:]
        if path not in allowed and not path.startswith("context/"):
            die(f"refresh would touch an unexpected path: {path}")
    if changed:
        run("git", "add", "CONTEXT.manifest", "context", cwd=repo)
        run(
            "git",
            "-c",
            "commit.gpgsign=false",
            "-c",
            "user.name=Alexandria",
            "-c",
            "user.email=local@alexandria",
            "commit",
            "-m",
            "Refresh selected context",
            cwd=repo,
        )
    state["export_commit"] = run("git", "rev-parse", "HEAD", cwd=repo, capture=True)
    state["allowlist_sha256"] = allowlist_digest
    state["selection_sha256"] = selected_digest
    write_json_atomic(state_path(root, name), state)
    print(f"context current at {state['export_commit']}")


def verify_exported_context(repo: Path, approved_selection: str) -> None:
    manifest_path = repo / "CONTEXT.manifest"
    manifest = read_text_file(manifest_path, "context manifest")
    if sha256_bytes(manifest.encode("utf-8")) != approved_selection:
        die("guest changed CONTEXT.manifest")
    rows: list[dict[str, str]] = []
    for number, line in enumerate(manifest.splitlines(), start=1):
        fields = line.split("\t")
        if len(fields) != 3 or not re.fullmatch(r"[0-9a-f]{64}", fields[0]):
            die(f"invalid context manifest line {number}")
        destination = validate_relative(fields[2], "context destination").as_posix()
        if not destination.startswith("context/"):
            die(f"context manifest escapes context/: {destination}")
        rows.append({"sha256": fields[0], "destination": destination})
    expected_paths = {row["destination"] for row in rows}
    actual_paths: set[str] = set()
    for path in (repo / "context").rglob("*"):
        if path.is_symlink():
            die(f"guest context contains a symlink: {path.relative_to(repo)}")
        if path.is_file():
            actual_paths.add(path.relative_to(repo).as_posix())
    if actual_paths != expected_paths:
        die("guest context path set differs from the approved projection")
    for row in rows:
        destination = repo / Path(*PurePosixPath(row["destination"]).parts)
        read_text_file(destination, "exported context")
        if row["sha256"] != sha256_file(destination):
            die(f"guest changed selected context: {row['destination']}")


def import_inbox(name: str) -> None:
    root, state, repo = active_workspace(name)
    export_commit = state["export_commit"]
    head = run("git", "rev-parse", "HEAD", cwd=repo, capture=True)
    result = subprocess.run(
        ("git", "merge-base", "--is-ancestor", export_commit, head), cwd=repo, check=False
    )
    if result.returncode:
        die("guest history no longer descends from the last trusted context export")
    changed = run("git", "diff", "--name-only", f"{export_commit}..{head}", cwd=repo, capture=True)
    for path in changed.splitlines():
        if path and not path.startswith("inbox/"):
            die(f"guest commit changed a protected path: {path}")
    verify_exported_context(repo, state["selection_sha256"])

    destination_root = root / "files" / "vault" / "input" / "guest" / name
    imported = state.setdefault("imports", {})
    count = 0
    inbox = repo / "inbox"
    for path in sorted(inbox.rglob("*")):
        if path.name == ".gitkeep":
            continue
        if path.is_symlink() or not path.is_file():
            die(f"inbox contains a non-regular file: {path.relative_to(repo)}")
        content = read_text_file(path, "guest inbox file")
        relative = path.relative_to(repo).as_posix()
        digest = sha256_bytes(content.encode("utf-8"))
        key = f"{relative}\t{digest}"
        if key in imported:
            continue
        safe_stem = re.sub(r"[^A-Za-z0-9._-]+", "-", path.name).strip(".-") or "note"
        output = destination_root / f"{head[:12]}-{safe_stem}.md"
        if output.exists():
            output = destination_root / f"{head[:12]}-{digest[:12]}-{safe_stem}.md"
        destination_root.mkdir(parents=True, exist_ok=True)
        remote = run("git", "remote", "get-url", "origin", cwd=repo, capture=True) if subprocess.run(
            ("git", "remote", "get-url", "origin"), cwd=repo, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
        ).returncode == 0 else str(repo)
        payload = (
            "---\n"
            "source: guest-workspace\n"
            f"guest: {name}\n"
            f"repository: {json.dumps(remote)}\n"
            f"commit: {head}\n"
            f"path: {json.dumps(relative)}\n"
            f"sha256: {digest}\n"
            "trust: untrusted\n"
            "---\n\n"
            f"{content}"
        )
        output.write_text(payload, encoding="utf-8")
        imported[key] = str(output.relative_to(root))
        count += 1
    write_json_atomic(state_path(root, name), state)
    print(f"imported {count} new inbox file(s) as untrusted captures")


def status(name: str) -> None:
    root = alex_dir()
    state = load_state(root, name)
    print(f"guest: {name}")
    print(f"active: {'yes' if state.get('active') else 'no'}")
    print(f"repo: {state.get('repo')}")
    print(f"allowlist sha256: {state.get('allowlist_sha256')}")
    print(f"selection sha256: {state.get('selection_sha256')}")
    print(f"imported: {len(state.get('imports', {}))}")


def off(name: str) -> None:
    root = alex_dir()
    state = load_state(root, name)
    state["active"] = False
    write_json_atomic(state_path(root, name), state)
    permission_path(root, name).unlink(missing_ok=True)
    print("off: local import and context refresh are disabled")
    print("the guest repo remains; revoke its remote credential or archive it separately")


def usage() -> "NoReturn":
    die(
        "use: guest_workspace.py plan NAME ALLOWLIST | enable NAME ALLOWLIST REPO | "
        "refresh NAME | import NAME | status NAME | off NAME"
    )


def main() -> None:
    if len(sys.argv) < 3:
        usage()
    command = sys.argv[1]
    name = safe_name(sys.argv[2])
    if command == "plan" and len(sys.argv) == 4:
        plan(name, Path(sys.argv[3]))
    elif command == "enable" and len(sys.argv) == 5:
        enable(name, Path(sys.argv[3]), Path(sys.argv[4]))
    elif command == "refresh" and len(sys.argv) == 3:
        refresh(name)
    elif command == "import" and len(sys.argv) == 3:
        import_inbox(name)
    elif command == "status" and len(sys.argv) == 3:
        status(name)
    elif command == "off" and len(sys.argv) == 3:
        off(name)
    else:
        usage()


if __name__ == "__main__":
    main()
