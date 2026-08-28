#!/usr/bin/env python3
"""Connect any untrusted AI through structurally isolated Airlock compartments."""

from __future__ import annotations

import fcntl
import hashlib
import json
import os
import re
import shutil
import stat
import subprocess
import sys
import tempfile
from contextlib import contextmanager
from pathlib import Path, PurePosixPath


MAX_BYTES = 1_000_000
NAME_RE = re.compile(r"^airlock(?:-[1-9][0-9]*)?$")


def die(message: str) -> "NoReturn":
    raise SystemExit(f"airlock: {message}")


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
        die("internal slot must be airlock or airlock-N; never name it after an app")
    return raw


def alex_dir() -> Path:
    return Path(os.environ.get("ALEXANDRIA_DIR", "~/alexandria")).expanduser().resolve()


def state_dir(root: Path) -> Path:
    return root / "system" / "airlock"


def permission_path(root: Path, name: str) -> Path:
    return root / "system" / "permissions" / name


def state_path(root: Path, name: str) -> Path:
    return state_dir(root) / f"{name}.json"


def ensure_state_ignores(root: Path) -> Path:
    directory = state_dir(root)
    directory.mkdir(parents=True, exist_ok=True)
    ignore = directory / ".gitignore"
    if ignore.is_symlink():
        die(f"Airlock state ignore file must not be a symlink: {ignore}")
    lines = ignore.read_text(encoding="utf-8").splitlines() if ignore.is_file() else []
    changed = False
    for pattern in ("*.json", "*.lock"):
        if pattern not in lines:
            lines.append(pattern)
            changed = True
    if changed:
        write_text_atomic(ignore, "\n".join(lines) + "\n")
    return directory


@contextmanager
def airlock_lock(root: Path, name: str):
    directory = ensure_state_ignores(root)
    lock_path = directory / f"{name}.lock"
    descriptor = os.open(lock_path, os.O_CREAT | os.O_RDWR, 0o600)
    os.fchmod(descriptor, 0o600)
    with os.fdopen(descriptor, "r+") as handle:
        fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
        yield


def managed_repo_path(name: str) -> Path:
    base = Path(
        os.environ.get("ALEXANDRIA_DATA_DIR", "~/.local/share/alexandria")
    ).expanduser()
    if name == "airlock":
        return (base / "airlock").resolve()
    return (base / "airlocks" / name).resolve()


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


def is_public_projection(rows: list[dict[str, str]]) -> bool:
    return all(row["source"].startswith("files/library/public/") for row in rows)


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
        die(f"no active Airlock slot named {name}")
    if payload.get("name") != name:
        die("Airlock state does not match its slot")
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
        die(f"not an Alexandria Airlock: {repo}")
    if run("git", "status", "--porcelain", cwd=repo, capture=True):
        die("Airlock has uncommitted files; commit or discard them before continuing")


def remote_url(repo: Path) -> str | None:
    result = subprocess.run(
        ("git", "config", "--get", "remote.origin.url"),
        cwd=repo,
        check=False,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
    )
    return result.stdout.strip() if result.returncode == 0 else None


def sync_remote(repo: Path) -> None:
    upstream = subprocess.run(
        ("git", "rev-parse", "--verify", "--quiet", "@{upstream}"),
        cwd=repo,
        check=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    if upstream.returncode:
        return
    run("git", "fetch", "--quiet", "origin", cwd=repo)
    run("git", "merge", "--ff-only", "@{upstream}", cwd=repo)


def push_remote(repo: Path) -> None:
    if remote_url(repo):
        run("git", "push", "--quiet", "origin", "HEAD:main", cwd=repo)


def github_repository(remote: str | None) -> str | None:
    if not remote:
        return None
    patterns = (
        r"https://github\.com/([^/]+/[^/]+?)(?:\.git)?/?",
        r"ssh://git@github\.com/([^/]+/[^/]+?)(?:\.git)?/?",
        r"git@github\.com:([^/]+/[^/]+?)(?:\.git)?",
    )
    for pattern in patterns:
        match = re.fullmatch(pattern, remote)
        if match:
            return match.group(1)
    return None


def write_text_atomic(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(content)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def plan(name: str, allowlist: Path) -> None:
    root = alex_dir()
    allowlist_digest, rows = parse_allowlist(root, allowlist)
    print("airlock")
    print(f"allowlist sha256: {allowlist_digest}")
    print(f"selection sha256: {selection_digest(rows)}")
    for row in rows:
        print(f"{row['source']} -> {row['destination']} ({row['sha256']})")
    if is_public_projection(rows):
        print("context: already-public Library shadow; refreshes automatically")
    else:
        print("context: private snapshot; exact selected bytes need approval")
    print("writes return through inbox/ or GitHub issues labelled airlock-capture")
    print("every return is an untrusted capture")


def enable(name: str, allowlist: Path, repo: Path | None) -> None:
    root = alex_dir()
    allowlist_digest, rows = parse_allowlist(root, allowlist)
    selected_digest = selection_digest(rows)
    public_projection = is_public_projection(rows)
    if not public_projection:
        require_approval(root, name, selected_digest)
    repo = repo.expanduser().resolve() if repo else managed_repo_path(name)
    if repo.exists():
        die(f"destination already exists; an Airlock must start fresh: {repo}")
    if state_path(root, name).exists():
        die(f"Airlock state already exists for {name}; use status or off")

    temporary = repo.with_name(f".{repo.name}.building-{os.getpid()}")
    if temporary.exists():
        die(f"temporary destination already exists: {temporary}")
    temporary.mkdir(parents=True)
    try:
        (temporary / "inbox").mkdir()
        (temporary / "inbox" / ".gitkeep").write_text("", encoding="utf-8")
        (temporary / "README.md").write_text(
            "# Airlock\n\n"
            "This is one isolated Airlock compartment. Its app identity is deliberately not part of the system.\n\n"
            "`context/` is selected read-only context. Write proposed work only under `inbox/`.\n\n"
            "If file writes are unavailable, open a GitHub issue labelled `airlock-capture`.\n\n"
            "Nothing here is canonical. The owner reviews every return before it can enter Alexandria.\n",
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
            "Create isolated Airlock",
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
        "public_projection": public_projection,
        "selection_sha256": selected_digest,
    }
    write_json_atomic(state_path(root, name), state)
    if public_projection:
        permission_path(root, name).unlink(missing_ok=True)
    print(f"ready: {repo}")
    print("no remote or agent credential was created")


def active_airlock(name: str) -> tuple[Path, dict, Path]:
    root = alex_dir()
    state = load_state(root, name)
    if not state.get("active"):
        die(f"Airlock {name} is off")
    if not state.get("public_projection"):
        require_approval(root, name, state["selection_sha256"])
    repo = Path(state["repo"]).resolve()
    assert_clean_repo(repo)
    return root, state, repo


def refresh(name: str, automatic: bool = False) -> bool:
    root = alex_dir()
    state = load_state(root, name)
    if not state.get("active"):
        die(f"Airlock {name} is off")
    repo = Path(state["repo"]).resolve()
    assert_clean_repo(repo)
    allowlist = Path(state["allowlist"])
    allowlist_digest, rows = parse_allowlist(root, allowlist)
    selected_digest = selection_digest(rows)
    public_projection = is_public_projection(rows)
    if automatic and not public_projection:
        return False
    if not public_projection:
        require_approval(root, name, selected_digest)
    copy_context(root, repo, rows)
    allowed = {"CONTEXT.manifest"}
    changed = run("git", "status", "--porcelain", cwd=repo, capture=True).splitlines()
    for line in changed:
        fields = line.split(maxsplit=1)
        path = fields[1] if len(fields) == 2 else ""
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
    state["public_projection"] = public_projection
    state["selection_sha256"] = selected_digest
    write_json_atomic(state_path(root, name), state)
    if public_projection:
        permission_path(root, name).unlink(missing_ok=True)
    push_remote(repo)
    print(f"context current at {state['export_commit']}")
    return bool(changed)


def verify_exported_context(repo: Path, approved_selection: str) -> None:
    manifest_path = repo / "CONTEXT.manifest"
    manifest = read_text_file(manifest_path, "context manifest")
    if sha256_bytes(manifest.encode("utf-8")) != approved_selection:
        die("external agent changed CONTEXT.manifest")
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
            die(f"Airlock context contains a symlink: {path.relative_to(repo)}")
        if path.is_file():
            actual_paths.add(path.relative_to(repo).as_posix())
    if actual_paths != expected_paths:
        die("Airlock context path set differs from the approved projection")
    for row in rows:
        destination = repo / Path(*PurePosixPath(row["destination"]).parts)
        read_text_file(destination, "exported context")
        if row["sha256"] != sha256_file(destination):
                die(f"external agent changed selected context: {row['destination']}")


def import_inbox(name: str) -> int:
    root, state, repo = active_airlock(name)
    sync_remote(repo)
    export_commit = state["export_commit"]
    head = run("git", "rev-parse", "HEAD", cwd=repo, capture=True)
    result = subprocess.run(
        ("git", "merge-base", "--is-ancestor", export_commit, head), cwd=repo, check=False
    )
    if result.returncode:
        die("Airlock history no longer descends from the last trusted context export")
    changed = run("git", "diff", "--name-only", f"{export_commit}..{head}", cwd=repo, capture=True)
    for path in changed.splitlines():
        if path and not path.startswith("inbox/"):
            die(f"external agent commit changed a protected path: {path}")
    verify_exported_context(repo, state["selection_sha256"])

    destination_root = root / "files" / "vault" / "input"
    imported = state.setdefault("imports", {})
    count = 0
    inbox = repo / "inbox"
    for path in sorted(inbox.rglob("*")):
        if path.name == ".gitkeep":
            continue
        if path.is_symlink() or not path.is_file():
            die(f"inbox contains a non-regular file: {path.relative_to(repo)}")
        content = read_text_file(path, "Airlock inbox file")
        relative = path.relative_to(repo).as_posix()
        digest = sha256_bytes(content.encode("utf-8"))
        key = f"{relative}\t{digest}"
        if key in imported:
            continue
        source_name = path.name[:-3] if path.name.lower().endswith(".md") else path.name
        safe_stem = re.sub(r"[^A-Za-z0-9._-]+", "-", source_name).strip(".-") or "note"
        output = destination_root / f"{name}-{head[:12]}-{digest[:12]}-{safe_stem}.md"
        remote = remote_url(repo) or str(repo)
        payload = (
            "---\n"
            "source: airlock\n"
            "channel: inbox\n"
            f"airlock: {name}\n"
            f"repository: {json.dumps(remote)}\n"
            f"commit: {head}\n"
            f"path: {json.dumps(relative)}\n"
            f"sha256: {digest}\n"
            "trust: untrusted\n"
            "---\n\n"
            f"{content}"
        )
        if output.exists():
            if output.read_text(encoding="utf-8") != payload:
                die(f"capture path collision: {output}")
        else:
            write_text_atomic(output, payload)
        imported[key] = str(output.relative_to(root))
        write_json_atomic(state_path(root, name), state)
        count += 1
    write_json_atomic(state_path(root, name), state)
    return count


def import_issues(name: str) -> int:
    root, state, repo = active_airlock(name)
    repository = github_repository(remote_url(repo))
    if not repository:
        return 0
    if shutil.which("gh") is None:
        die("GitHub Airlock detected but `gh` is unavailable, so issues cannot drain")

    label = "airlock-capture"
    raw = run(
        "gh",
        "issue",
        "list",
        "--repo",
        repository,
        "--label",
        label,
        "--state",
        "open",
        "--limit",
        "1000",
        "--json",
        "number,title,body,createdAt,url",
        capture=True,
    )
    try:
        issues = json.loads(raw)
    except json.JSONDecodeError:
        die("GitHub returned invalid issue data")
    if not isinstance(issues, list):
        die("GitHub issue data is not a list")

    destination_root = root / "files" / "vault" / "input"
    imported = state.setdefault("issue_imports", {})
    count = 0
    for issue in issues:
        if not isinstance(issue, dict):
            die("GitHub returned an invalid issue")
        number = issue.get("number")
        title = issue.get("title")
        body = issue.get("body")
        if body is None:
            body = ""
        created_at = issue.get("createdAt")
        url = issue.get("url")
        if not isinstance(number, int) or number < 1:
            die("GitHub issue number is invalid")
        if not all(isinstance(value, str) for value in (title, body, created_at, url)):
            die(f"GitHub issue #{number} has invalid text fields")
        if "\x00" in body or len(body.encode("utf-8")) > MAX_BYTES:
            die(f"GitHub issue #{number} is binary or exceeds {MAX_BYTES} bytes")
        date = created_at[:10] if re.fullmatch(r"\d{4}-\d{2}-\d{2}.*", created_at) else "undated"
        key = f"{repository}#{number}"
        output = destination_root / f"{date}-{name}-issue-{number}.md"
        payload = (
            "---\n"
            "source: airlock\n"
            "channel: github-issue\n"
            f"airlock: {name}\n"
            f"repository: {json.dumps(repository)}\n"
            f"issue: {number}\n"
            f"url: {json.dumps(url)}\n"
            f"created: {json.dumps(created_at)}\n"
            f"title: {json.dumps(title)}\n"
            "trust: untrusted\n"
            "---\n\n"
            f"{body}"
        )
        if key not in imported:
            if output.exists():
                if output.read_text(encoding="utf-8") != payload:
                    die(f"capture path collision: {output}")
            else:
                write_text_atomic(output, payload)
            imported[key] = str(output.relative_to(root))
            write_json_atomic(state_path(root, name), state)
            count += 1
        else:
            recorded = root / imported[key]
            archived = root / "files" / "vault" / "_input" / recorded.name
            copies = [path for path in (recorded, archived) if path.is_file()]
            if not copies or all(path.read_text(encoding="utf-8") != payload for path in copies):
                die(f"recorded capture is missing or changed for GitHub issue #{number}")
        run(
            "gh",
            "issue",
            "close",
            str(number),
            "--repo",
            repository,
            capture=True,
        )
    return count


def import_all(name: str) -> None:
    with airlock_lock(alex_dir(), name):
        inbox_count = import_inbox(name)
        issue_count = import_issues(name)
        context_updated = refresh(name, automatic=True)
    print(
        f"imported {inbox_count} inbox file(s) and {issue_count} GitHub issue(s) "
        "as untrusted captures"
    )
    if context_updated:
        print("updated the already-public Library shadow")


def import_all_active() -> None:
    root = alex_dir()
    directory = state_dir(root)
    if not directory.is_dir():
        return
    failures: list[str] = []
    for path in sorted(directory.glob("*.json")):
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            failures.append(f"{path.name}: invalid state")
            continue
        name = payload.get("name")
        if not payload.get("active"):
            continue
        if not isinstance(name, str) or not NAME_RE.fullmatch(name):
            failures.append(f"{path.name}: invalid name")
            continue
        try:
            import_all(name)
        except SystemExit as exc:
            failures.append(f"{name}: {exc}")
    if failures:
        die("; ".join(failures))


def status(name: str) -> None:
    root = alex_dir()
    state = load_state(root, name)
    print("airlock")
    print(f"active: {'yes' if state.get('active') else 'no'}")
    print(f"repo: {state.get('repo')}")
    print(
        "context: "
        + (
            "public Library shadow (auto-sync)"
            if state.get("public_projection")
            else "private approved snapshot"
        )
    )
    print(f"allowlist sha256: {state.get('allowlist_sha256')}")
    print(f"selection sha256: {state.get('selection_sha256')}")
    print(f"inbox imports: {len(state.get('imports', {}))}")
    print(f"issue imports: {len(state.get('issue_imports', {}))}")
    print("issue label: airlock-capture")


def off(name: str) -> None:
    root = alex_dir()
    state = load_state(root, name)
    state["active"] = False
    write_json_atomic(state_path(root, name), state)
    permission_path(root, name).unlink(missing_ok=True)
    print("off: local import and context refresh are disabled")
    print("the Airlock repo remains; revoke its remote credential or archive it separately")


def usage() -> "NoReturn":
    die(
        "use: airlock.py plan SLOT ALLOWLIST | enable SLOT ALLOWLIST [REPO] | "
        "refresh SLOT | import SLOT | import-all | status SLOT | off SLOT"
    )


def main() -> None:
    if len(sys.argv) == 2 and sys.argv[1] == "import-all":
        import_all_active()
        return
    if len(sys.argv) < 3:
        usage()
    command = sys.argv[1]
    name = safe_name(sys.argv[2])
    if command == "plan" and len(sys.argv) == 4:
        plan(name, Path(sys.argv[3]))
    elif command == "enable" and len(sys.argv) in (4, 5):
        with airlock_lock(alex_dir(), name):
            enable(name, Path(sys.argv[3]), Path(sys.argv[4]) if len(sys.argv) == 5 else None)
    elif command == "refresh" and len(sys.argv) == 3:
        with airlock_lock(alex_dir(), name):
            refresh(name)
    elif command == "import" and len(sys.argv) == 3:
        import_all(name)
    elif command == "status" and len(sys.argv) == 3:
        status(name)
    elif command == "off" and len(sys.argv) == 3:
        with airlock_lock(alex_dir(), name):
            off(name)
    else:
        usage()


if __name__ == "__main__":
    main()
