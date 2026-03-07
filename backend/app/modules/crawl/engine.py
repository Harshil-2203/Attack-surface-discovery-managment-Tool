import subprocess
import asyncio
import os
from concurrent.futures import ThreadPoolExecutor

_executor = ThreadPoolExecutor(max_workers=4)

GO_BIN = r"C:\Users\LENOVO\go\bin"

TOOL_PATHS = {
    "gau":         os.path.join(GO_BIN, "gau.exe"),
    "waybackurls": os.path.join(GO_BIN, "waybackurls.exe"),
    "katana":      os.path.join(GO_BIN, "katana.exe"),
}

_ENV = os.environ.copy()
_ENV["PATH"] = GO_BIN + os.pathsep + _ENV.get("PATH", "")


# ── gau: domain via stdin bytes (same approach that fixed waybackurls) ────────
def _run_gau(domain: str, timeout: int = 180) -> list[str]:
    exe = TOOL_PATHS["gau"]
    if not os.path.isfile(exe):
        print(f"[crawl] gau not found at {exe}")
        return []

    cmd = [exe, "--subs", "--threads", "5"]
    print(f"[crawl] gau cmd: {exe} --subs --threads 5 (domain via stdin)")

    try:
        proc = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=_ENV,
        )
        stdout_bytes, stderr_bytes = proc.communicate(
            input=(domain + "\n").encode("utf-8"),
            timeout=timeout,
        )
        stdout = stdout_bytes.decode("utf-8", errors="ignore")
        stderr = stderr_bytes.decode("utf-8", errors="ignore")

        print(f"[crawl] gau exit={proc.returncode}")
        if stderr.strip():
            print(f"[crawl] gau stderr: {stderr[:800]}")

        lines = [l.strip() for l in stdout.splitlines() if l.strip()]
        print(f"[crawl] gau -> {len(lines)} URLs")
        return lines
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.communicate()
        print(f"[crawl] gau timed out after {timeout}s")
        return []
    except Exception as e:
        print(f"[crawl] gau error: {e}")
        return []


# ── waybackurls: write domain via stdin bytes directly (no shell, no echo) ────
# waybackurls ONLY supports stdin — but we pass it via Popen stdin pipe directly
def _run_waybackurls(domain: str, timeout: int = 120) -> list[str]:
    exe = TOOL_PATHS["waybackurls"]
    if not os.path.isfile(exe):
        print(f"[crawl] waybackurls not found at {exe}")
        return []

    cmd = [exe]
    print(f"[crawl] waybackurls cmd: {exe} (domain via stdin)")

    try:
        # Use Popen directly so we control stdin encoding precisely
        proc = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=_ENV,
        )
        # Write domain as raw bytes with Unix newline — avoids Windows echo quirks
        stdout_bytes, stderr_bytes = proc.communicate(
            input=(domain + "\n").encode("utf-8"),
            timeout=timeout,
        )
        stdout = stdout_bytes.decode("utf-8", errors="ignore")
        stderr = stderr_bytes.decode("utf-8", errors="ignore")

        print(f"[crawl] waybackurls exit={proc.returncode}")
        if stderr.strip():
            print(f"[crawl] waybackurls stderr: {stderr[:800]}")

        lines = [l.strip() for l in stdout.splitlines() if l.strip()]
        print(f"[crawl] waybackurls -> {len(lines)} URLs")
        return lines
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.communicate()
        print(f"[crawl] waybackurls timed out after {timeout}s")
        return []
    except Exception as e:
        print(f"[crawl] waybackurls error: {e}")
        return []


# ── katana: unchanged — already working ──────────────────────────────────────
def _run_katana(domain: str, timeout: int = 150) -> list[str]:
    exe = TOOL_PATHS["katana"]
    if not os.path.isfile(exe):
        print(f"[crawl] katana not found at {exe}")
        return []

    target = domain if domain.startswith("http") else f"https://{domain}"
    cmd = [exe, "-u", target, "-d", "3", "-silent", "-nc"]
    print(f"[crawl] katana cmd: {' '.join(cmd)}")

    try:
        proc = subprocess.run(
            cmd, capture_output=True, text=True, timeout=timeout, env=_ENV,
        )
        print(f"[crawl] katana exit={proc.returncode}")
        if proc.stderr.strip():
            print(f"[crawl] katana stderr: {proc.stderr[:500]}")
        lines = [l.strip() for l in proc.stdout.splitlines() if l.strip()]
        print(f"[crawl] katana -> {len(lines)} URLs")
        return lines
    except subprocess.TimeoutExpired:
        print(f"[crawl] katana timed out after {timeout}s")
        return []
    except Exception as e:
        print(f"[crawl] katana error: {e}")
        return []


# ── Async wrappers ────────────────────────────────────────────────────────────

async def run_gau(domain: str) -> list[str]:
    return await asyncio.get_event_loop().run_in_executor(
        _executor, lambda: _run_gau(domain))

async def run_waybackurls(domain: str) -> list[str]:
    return await asyncio.get_event_loop().run_in_executor(
        _executor, lambda: _run_waybackurls(domain))

async def run_katana(domain: str) -> list[str]:
    return await asyncio.get_event_loop().run_in_executor(
        _executor, lambda: _run_katana(domain))


# ── Main entry ────────────────────────────────────────────────────────────────

async def run_crawl(domain: str) -> dict:
    print(f"\n[crawl] ===== Starting crawl: {domain} =====")

    gau_urls, wayback_urls, katana_urls = await asyncio.gather(
        run_gau(domain),
        run_waybackurls(domain),
        run_katana(domain),
    )

    all_urls = list(set(gau_urls + wayback_urls + katana_urls))
    print(f"[crawl] ===== Done -- unique URLs: {len(all_urls)} =====\n")

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
        "parameters": [], "api_paths": [], "admin_paths": [],
        "js_files": [], "sensitive_files": [], "endpoints": [], "other": [],
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