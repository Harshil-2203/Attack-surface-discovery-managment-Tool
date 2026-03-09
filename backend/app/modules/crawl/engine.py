"""
modules/crawl_engine.py
Cross-platform crawl engine — works on Windows, Linux (Kali), macOS.
Auto-discovers gau / waybackurls / katana from:
  1. System PATH (installed via `go install` or package manager)
  2. Common Go bin locations per OS
  3. Current directory / project bin/
"""

import subprocess
import asyncio
import os
import sys
import shutil
from concurrent.futures import ThreadPoolExecutor

_executor = ThreadPoolExecutor(max_workers=4)


# ── Cross-platform tool discovery ─────────────────────────────────────────────

def _find_tool(name: str) -> str | None:
    """
    Find a tool executable across platforms.
    Returns full path string or None if not found.
    """
    # On Windows executables have .exe suffix
    exe_name = f"{name}.exe" if sys.platform == "win32" else name

    # 1. Check system PATH first (covers `go install`, apt, brew, etc.)
    found = shutil.which(exe_name)
    if found:
        return found
    # Also try without .exe on Windows in case it's a script wrapper
    if sys.platform == "win32":
        found = shutil.which(name)
        if found:
            return found

    # 2. Common Go bin directories per OS
    home = os.path.expanduser("~")
    candidates = []

    if sys.platform == "win32":
        candidates = [
            os.path.join(home, "go", "bin", exe_name),
            os.path.join("C:\\", "Users", os.getenv("USERNAME", ""), "go", "bin", exe_name),
            os.path.join("C:\\", "Go", "bin", exe_name),
            os.path.join(os.getenv("GOPATH", ""), "bin", exe_name),
            os.path.join(os.getenv("GOROOT", ""), "bin", exe_name),
        ]
    elif sys.platform == "darwin":
        candidates = [
            os.path.join(home, "go", "bin", exe_name),
            os.path.join(home, ".go", "bin", exe_name),
            f"/usr/local/bin/{exe_name}",
            f"/opt/homebrew/bin/{exe_name}",
            os.path.join(os.getenv("GOPATH", os.path.join(home, "go")), "bin", exe_name),
        ]
    else:
        # Linux / Kali / Ubuntu / Parrot etc.
        candidates = [
            os.path.join(home, "go", "bin", exe_name),
            os.path.join(home, ".go", "bin", exe_name),
            f"/usr/local/go/bin/{exe_name}",
            f"/usr/bin/{exe_name}",
            f"/usr/local/bin/{exe_name}",
            f"/snap/bin/{exe_name}",
            os.path.join(os.getenv("GOPATH", os.path.join(home, "go")), "bin", exe_name),
        ]

    # 3. Project-local bin/ folder (for bundled tools)
    script_dir = os.path.dirname(os.path.abspath(__file__))
    candidates += [
        os.path.join(script_dir, "bin", exe_name),
        os.path.join(script_dir, "..", "bin", exe_name),
    ]

    for path in candidates:
        if path and os.path.isfile(path) and os.access(path, os.X_OK):
            return path

    return None


# Discover all three tools at startup
TOOL_PATHS: dict[str, str | None] = {
    "gau":         _find_tool("gau"),
    "waybackurls": _find_tool("waybackurls"),
    "katana":      _find_tool("katana"),
}

# Build a clean environment — add all known Go bin dirs to PATH
def _build_env() -> dict:
    env = os.environ.copy()
    home = os.path.expanduser("~")
    extra_paths = [
        os.path.join(home, "go", "bin"),
        os.path.join(home, ".go", "bin"),
        os.path.join(os.getenv("GOPATH", os.path.join(home, "go")), "bin"),
    ]
    if sys.platform == "win32":
        extra_paths += [
            os.path.join("C:\\", "Go", "bin"),
            os.path.join(home, "go", "bin"),
        ]
    else:
        extra_paths += ["/usr/local/go/bin", "/usr/local/bin"]

    existing = env.get("PATH", "")
    env["PATH"] = os.pathsep.join(p for p in extra_paths if p) + os.pathsep + existing
    return env

_ENV = _build_env()


def _log_tool_status():
    """Log discovered tool paths at startup for easy debugging."""
    print("[crawl] Tool discovery:")
    for tool, path in TOOL_PATHS.items():
        status = path if path else "NOT FOUND"
        print(f"  {tool:15} -> {status}")

_log_tool_status()


# ── gau ───────────────────────────────────────────────────────────────────────

def _run_gau(domain: str, timeout: int = 180) -> list[str]:
    exe = TOOL_PATHS["gau"]
    if not exe:
        print("[crawl] gau not found — skipping (install: go install github.com/lc/gau/v2/cmd/gau@latest)")
        return []

    cmd = [exe, "--subs", "--threads", "5"]
    print(f"[crawl] gau: {exe} (stdin)")
    try:
        proc = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=_ENV,
        )
        stdout_b, stderr_b = proc.communicate(
            input=(domain + "\n").encode("utf-8"),
            timeout=timeout,
        )
        lines = [l.strip() for l in stdout_b.decode("utf-8", errors="ignore").splitlines() if l.strip()]
        print(f"[crawl] gau -> {len(lines)} URLs (exit {proc.returncode})")
        return lines
    except subprocess.TimeoutExpired:
        proc.kill(); proc.communicate()
        print(f"[crawl] gau timed out after {timeout}s")
        return []
    except Exception as e:
        print(f"[crawl] gau error: {e}")
        return []


# ── waybackurls ───────────────────────────────────────────────────────────────

def _run_waybackurls(domain: str, timeout: int = 120) -> list[str]:
    exe = TOOL_PATHS["waybackurls"]
    if not exe:
        print("[crawl] waybackurls not found — skipping (install: go install github.com/tomnomnom/waybackurls@latest)")
        return []

    cmd = [exe]
    print(f"[crawl] waybackurls: {exe} (stdin)")
    try:
        proc = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=_ENV,
        )
        stdout_b, stderr_b = proc.communicate(
            input=(domain + "\n").encode("utf-8"),
            timeout=timeout,
        )
        lines = [l.strip() for l in stdout_b.decode("utf-8", errors="ignore").splitlines() if l.strip()]
        print(f"[crawl] waybackurls -> {len(lines)} URLs (exit {proc.returncode})")
        return lines
    except subprocess.TimeoutExpired:
        proc.kill(); proc.communicate()
        print(f"[crawl] waybackurls timed out after {timeout}s")
        return []
    except Exception as e:
        print(f"[crawl] waybackurls error: {e}")
        return []


# ── katana ────────────────────────────────────────────────────────────────────

def _run_katana(domain: str, timeout: int = 150) -> list[str]:
    exe = TOOL_PATHS["katana"]
    if not exe:
        print("[crawl] katana not found — skipping (install: go install github.com/projectdiscovery/katana/cmd/katana@latest)")
        return []

    target = domain if domain.startswith("http") else f"https://{domain}"
    cmd = [exe, "-u", target, "-d", "3", "-silent", "-nc"]
    print(f"[crawl] katana: {' '.join(cmd)}")
    try:
        proc = subprocess.run(
            cmd, capture_output=True, text=True, timeout=timeout, env=_ENV,
        )
        lines = [l.strip() for l in proc.stdout.splitlines() if l.strip()]
        print(f"[crawl] katana -> {len(lines)} URLs (exit {proc.returncode})")
        return lines
    except subprocess.TimeoutExpired:
        print(f"[crawl] katana timed out after {timeout}s")
        return []
    except Exception as e:
        print(f"[crawl] katana error: {e}")
        return []


# ── Async wrappers ────────────────────────────────────────────────────────────

async def run_gau(domain: str) -> list[str]:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(_executor, lambda: _run_gau(domain))

async def run_waybackurls(domain: str) -> list[str]:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(_executor, lambda: _run_waybackurls(domain))

async def run_katana(domain: str) -> list[str]:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(_executor, lambda: _run_katana(domain))


# ── Main entry ────────────────────────────────────────────────────────────────

async def run_crawl(domain: str) -> dict:
    print(f"\n[crawl] ===== Starting crawl: {domain} =====")

    gau_urls, wayback_urls, katana_urls = await asyncio.gather(
        run_gau(domain),
        run_waybackurls(domain),
        run_katana(domain),
    )

    all_urls = list(set(gau_urls + wayback_urls + katana_urls))
    print(f"[crawl] ===== Done — unique URLs: {len(all_urls)} =====\n")

    return {
        "domain":       domain,
        "total_unique": len(all_urls),
        "sources": {
            "gau":         len(gau_urls),
            "waybackurls": len(wayback_urls),
            "katana":      len(katana_urls),
        },
        "urls":       all_urls,
        "categories": _categorize(all_urls),
    }


# ── Categorization ────────────────────────────────────────────────────────────

def _categorize(urls: list[str]) -> dict:
    buckets: dict[str, list] = {
        "parameters":      [],
        "api_paths":       [],
        "admin_paths":     [],
        "js_files":        [],
        "sensitive_files": [],
        "endpoints":       [],
        "other":           [],
    }
    sensitive_exts = {
        ".sql", ".bak", ".backup", ".env", ".config", ".conf", ".log",
        ".zip", ".tar", ".gz", ".7z", ".db", ".sqlite", ".pem", ".key",
        ".crt", ".xml", ".yml", ".yaml",
    }
    sensitive_kws = [
        "password", "passwd", "secret", "token", "apikey", "api_key",
        "auth", "credential", "private", "backup", "config",
    ]
    for url in urls:
        u = url.lower()
        if u.endswith(".js") or ".js?" in u or ".js#" in u:
            buckets["js_files"].append(url)
        elif any(p in u for p in ["/api/", "/v1/", "/v2/", "/v3/", "/graphql", "/rest/", "/rpc/"]):
            buckets["api_paths"].append(url)
        elif any(p in u for p in ["/admin", "/panel", "/dashboard", "/manage", "/console", "/cpanel", "/wp-admin"]):
            buckets["admin_paths"].append(url)
        elif any(u.endswith(e) for e in sensitive_exts) or any(k in u for k in sensitive_kws):
            buckets["sensitive_files"].append(url)
        elif "?" in url:
            buckets["parameters"].append(url)
        elif u.startswith("http"):
            buckets["endpoints"].append(url)
        else:
            buckets["other"].append(url)
    return {k: v for k, v in buckets.items() if v}