import subprocess
import asyncio
import os
import sys
from concurrent.futures import ThreadPoolExecutor

_executor = ThreadPoolExecutor(max_workers=4)

# Hardcoded since debug confirmed all three are here
GO_BIN = r"C:\Users\LENOVO\go\bin"

TOOL_PATHS = {
    "gau":          os.path.join(GO_BIN, "gau.exe"),
    "waybackurls":  os.path.join(GO_BIN, "waybackurls.exe"),
    "katana":       os.path.join(GO_BIN, "katana.exe"),
}


def _run_cmd(
    tool: str,
    args: list[str],
    stdin_text: str | None = None,
    timeout: int = 120,
) -> list[str]:
    """
    Run a tool synchronously inside a thread.
    Does NOT use CREATE_NO_WINDOW — that flag causes silent failures
    when uvicorn uses ProactorEventLoop on Windows.
    """
    exe = TOOL_PATHS.get(tool)
    if not exe or not os.path.isfile(exe):
        print(f"[crawl] {tool} not found at {exe}")
        return []

    cmd = [exe] + args
    print(f"[crawl] Running: {tool} {' '.join(args)}")

    try:
        proc = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            # NO creationflags — this is the key fix
        )
        stdout, stderr = proc.communicate(
            input=stdin_text,
            timeout=timeout,
        )
        lines = [l.strip() for l in stdout.splitlines() if l.strip()]
        if stderr.strip():
            print(f"[crawl] {tool} stderr: {stderr[:300]}")
        print(f"[crawl] {tool} → {len(lines)} URLs")
        return lines

    except subprocess.TimeoutExpired:
        proc.kill()
        proc.communicate()
        print(f"[crawl] {tool} timed out after {timeout}s")
        return []
    except Exception as e:
        print(f"[crawl] {tool} error: {e}")
        return []


async def _async_run(tool: str, args: list[str], stdin_text: str | None = None, timeout: int = 120) -> list[str]:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        _executor,
        lambda: _run_cmd(tool, args, stdin_text, timeout)
    )


# ── Individual tools ──────────────────────────────────────────────────────────

async def run_gau(domain: str) -> list[str]:
    # gau <domain> --subs --threads 5
    return await _async_run("gau", ["--subs", "--threads", "5", domain], timeout=120)


async def run_waybackurls(domain: str) -> list[str]:
    # echo domain | waybackurls   →  pass domain via stdin
    return await _async_run("waybackurls", [], stdin_text=domain + "\n", timeout=120)


async def run_katana(domain: str) -> list[str]:
    target = domain if domain.startswith("http") else f"https://{domain}"
    # katana -u <url> -d 3 -silent -nc
    return await _async_run("katana", ["-u", target, "-d", "3", "-silent", "-nc"], timeout=150)


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
        "domain": domain,
        "total_unique": len(all_urls),
        "sources": {
            "gau":         len(gau_urls),
            "waybackurls": len(wayback_urls),
            "katana":      len(katana_urls),
        },
        "urls": all_urls,
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