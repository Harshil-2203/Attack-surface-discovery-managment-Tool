# routers/targets.py
"""
Target Management — Autopsy/FTK style persistence
Each target is a folder on disk containing:
  target.json        — metadata (org, operator, scope)
  scans/             — one JSON per scan run
  crawls/            — one JSON per crawl run
  subdomains.txt     — cumulative deduplicated subdomain list
  urls.txt           — cumulative deduplicated URL list
"""

import os
import json
from datetime import datetime
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/targets", tags=["targets"])


# ── Helpers ───────────────────────────────────────────────────────────────────

def _meta_file(folder: str) -> Path:
    return Path(folder) / "target.json"

def _read_meta(folder: str) -> dict:
    mp = _meta_file(folder)
    if not mp.exists():
        raise HTTPException(404, f"target.json not found in: {folder}")
    with open(mp, "r", encoding="utf-8") as f:
        return json.load(f)

def _write_meta(folder: str, meta: dict):
    with open(_meta_file(folder), "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2, default=str)

def _ts() -> str:
    return datetime.utcnow().strftime("%Y%m%d_%H%M%S")


# ── Models ────────────────────────────────────────────────────────────────────

class CreateTargetRequest(BaseModel):
    save_folder:      str          # chosen by user e.g. C:\Targets\Acme
    analyst_name:     str
    analyst_id:       str = ""
    team:             str = ""
    role:             str = "analyst"
    email:            str = ""
    org_name:         str
    primary_domain:   str
    sector:           str = ""
    additional_scope: str = ""
    out_of_scope:     str = ""
    engagement_type:  str = ""
    auth_level:       str = ""
    start_date:       str = ""
    end_date:         str = ""
    target_ref:       str = ""
    notes:            str = ""

class OpenTargetRequest(BaseModel):
    folder: str

class SaveScanRequest(BaseModel):
    folder: str
    domain: str
    result: dict

class SaveCrawlRequest(BaseModel):
    folder: str
    domain: str
    result: dict


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/validate-folder")
async def validate_folder(path: str):
    """Check if a folder path is writable before creating a target."""
    p = Path(path)
    try:
        p.mkdir(parents=True, exist_ok=True)
        test = p / ".asdmt_write_test"
        test.touch()
        test.unlink()
        return {"valid": True}
    except Exception as e:
        return {"valid": False, "error": str(e)}


@router.post("/create")
async def create_target(body: CreateTargetRequest):
    """
    Create a new target folder on disk with subdirectory structure.
    Returns full metadata including the generated target_folder path.
    """
    base = Path(body.save_folder)
    try:
        base.mkdir(parents=True, exist_ok=True)
    except Exception as e:
        raise HTTPException(400, f"Cannot create folder '{body.save_folder}': {e}")

    # Generate target ID + subfolder name
    safe_org  = "".join(c if c.isalnum() else "_" for c in body.org_name)[:20]
    target_id = f"TGT_{safe_org}_{_ts()}"
    tgt_dir   = base / target_id

    try:
        tgt_dir.mkdir(parents=True, exist_ok=True)
        (tgt_dir / "scans").mkdir(exist_ok=True)
        (tgt_dir / "crawls").mkdir(exist_ok=True)
    except Exception as e:
        raise HTTPException(400, f"Cannot create target directory: {e}")

    meta = {
        "target_id":      target_id,
        "target_folder":  str(tgt_dir),
        "created_at":     datetime.utcnow().isoformat(),
        "updated_at":     datetime.utcnow().isoformat(),
        "status":         "active",
        "analyst_name":   body.analyst_name,
        "analyst_id":     body.analyst_id,
        "team":           body.team,
        "role":           body.role,
        "email":          body.email,
        "org_name":       body.org_name,
        "primary_domain": body.primary_domain,
        "sector":         body.sector,
        "additional_scope": body.additional_scope,
        "out_of_scope":   body.out_of_scope,
        "engagement_type": body.engagement_type,
        "auth_level":     body.auth_level,
        "start_date":     body.start_date,
        "end_date":       body.end_date,
        "target_ref":     body.target_ref,
        "notes":          body.notes,
        "scan_count":     0,
        "crawl_count":    0,
        "total_subdomains": 0,
        "total_urls":     0,
    }

    _write_meta(str(tgt_dir), meta)
    print(f"[targets] Created {target_id} at {tgt_dir}")
    return meta


@router.post("/open")
async def open_target(body: OpenTargetRequest):
    """
    Open an existing target folder. Returns metadata + all saved findings.
    Frontend uses this to restore previous scan/crawl results on reload.
    """
    folder   = body.folder.strip()
    tgt_dir  = Path(folder)

    if not tgt_dir.exists():
        raise HTTPException(404, f"Folder not found: {folder}")

    meta = _read_meta(folder)

    # Load scans — only keep the latest one to avoid sending huge payloads
    scans = []
    scans_dir = tgt_dir / "scans"
    scans_dir.mkdir(exist_ok=True)
    scan_files = sorted(scans_dir.glob("*.json"))
    # Only load the latest scan (the one we actually need to restore state)
    for f in scan_files[-1:]:
        try:
            with open(f, "r", encoding="utf-8") as fh:
                scans.append(json.load(fh))
        except Exception:
            pass

    # Load crawl metadata — read only first 2KB per file (avoids 8s+ timeout on 131k URL files)
    crawls = []
    crawls_dir = tgt_dir / "crawls"
    crawls_dir.mkdir(exist_ok=True)
    import re as _re
    def _crawl_ts_key(p):
        m = _re.search(r"(\d{8}_\d{6})", p.name)
        return m.group(1) if m else "00000000_000000"
    crawl_files = sorted(crawls_dir.glob("*.json"), key=_crawl_ts_key)
    for f in crawl_files:
        try:
            with open(f, "r", encoding="utf-8") as fh:
                head = fh.read(2048)
            def _grab(key, _h=head):
                m = _re.search('"' + key + r'"[ \t]*:[ \t]*"([^"]*)"', _h)
                return m.group(1) if m else ""
            def _grab_int(key, _h=head):
                m = _re.search('"' + key + r'"[ \t]*:[ \t]*([0-9]+)', _h)
                return int(m.group(1)) if m else 0
            crawls.append({
                "domain":     _grab("domain"),
                "saved_at":   _grab("saved_at"),
                "total_urls": _grab_int("total_urls") or _grab_int("total_unique"),
                "file":       f.name,
            })
        except Exception:
            pass

    # Latest cumulative lists
    subs_file = tgt_dir / "subdomains.txt"
    subdomains = []
    if subs_file.exists():
        with open(subs_file, "r", encoding="utf-8") as f:
            subdomains = [l.strip() for l in f if l.strip()]

    urls_file = tgt_dir / "urls.txt"
    urls = []
    if urls_file.exists():
        with open(urls_file, "r", encoding="utf-8") as f:
            urls = [l.strip() for l in f if l.strip()]

    return {
        "meta":       meta,
        "scans":      scans,
        "crawls":     crawls,
        "subdomains": subdomains,
        "urls":       urls,
    }


@router.post("/save-scan")
async def save_scan(body: SaveScanRequest):
    """
    Called automatically after every scan run.
    Saves JSON + merges subdomains into subdomains.txt.
    """
    tgt_dir = Path(body.folder)
    if not tgt_dir.exists():
        raise HTTPException(404, "Target folder not found")

    filename = f"scan_{body.domain.replace('.','_')}_{_ts()}.json"
    with open(tgt_dir / "scans" / filename, "w", encoding="utf-8") as f:
        json.dump({
            "domain":    body.domain,
            "saved_at":  datetime.utcnow().isoformat(),
            **body.result
        }, f, indent=2, default=str)

    # Merge into subdomains.txt
    subs_file = tgt_dir / "subdomains.txt"
    existing  = set()
    if subs_file.exists():
        with open(subs_file, "r", encoding="utf-8") as f:
            existing = {l.strip() for l in f if l.strip()}
    new_subs = set(body.result.get("subdomains", []))
    merged   = sorted(existing | new_subs)
    with open(subs_file, "w", encoding="utf-8") as f:
        f.write("\n".join(merged))

    # Update meta
    meta = _read_meta(body.folder)
    meta["scan_count"]       += 1
    meta["total_subdomains"]  = len(merged)
    meta["updated_at"]        = datetime.utcnow().isoformat()
    _write_meta(body.folder, meta)

    return {"ok": True, "file": filename, "total_subdomains": len(merged)}


@router.post("/save-crawl")
async def save_crawl(body: SaveCrawlRequest):
    """
    Called automatically after every crawl run.
    Saves JSON + merges URLs into urls.txt.
    """
    tgt_dir = Path(body.folder)
    if not tgt_dir.exists():
        raise HTTPException(404, "Target folder not found")

    filename = f"crawl_{body.domain.replace('.', '_')}_{_ts()}.json"
    (tgt_dir / "crawls").mkdir(exist_ok=True)
    crawl_data = {
        "domain":     body.domain,
        "saved_at":   datetime.utcnow().isoformat(),
        "total_urls": len(body.result.get("urls", [])),
        **body.result,
    }
    with open(tgt_dir / "crawls" / filename, "w", encoding="utf-8") as f:
        json.dump(crawl_data, f, indent=2, default=str)

    # Write urls.txt with ONLY this crawl's URLs (not merged across crawls)
    # Each crawl run overwrites urls.txt so it always reflects the latest crawl
    new_urls = body.result.get("urls", [])
    urls_file = tgt_dir / "urls.txt"
    with open(urls_file, "w", encoding="utf-8") as f:
        f.write("\n".join(sorted(set(new_urls))))

    # Update meta
    meta = _read_meta(body.folder)
    meta["crawl_count"]  = meta.get("crawl_count", 0) + 1
    meta["total_urls"]    = len(new_urls)
    meta["last_crawl_domain"] = body.domain
    meta["updated_at"]    = datetime.utcnow().isoformat()
    _write_meta(body.folder, meta)

    return {"ok": True, "file": filename, "total_urls": len(new_urls)}


# ── Load latest crawl (called lazily when CrawlViewer opens) ─────────────────

@router.get("/load-crawl")
async def load_crawl(folder: str, domain: str = ""):
    """
    Return the latest crawl JSON for the given domain (if provided),
    or the globally latest crawl if no domain is specified.

    Filtering by domain prevents a stale crawl from a DIFFERENT domain
    being restored when a project is re-opened — e.g. a tryhackme crawl
    being shown as the result for a flexifunnels project.

    Sort key: timestamp suffix (YYYYMMDD_HHMMSS) embedded in the filename,
    which is always reliable regardless of domain-name prefix ordering or
    OS mtime changes caused by unrelated writes.
    """
    tgt_dir = Path(folder)
    if not tgt_dir.exists():
        return None
    crawls_dir = tgt_dir / "crawls"
    crawls_dir.mkdir(exist_ok=True)

    all_files = list(crawls_dir.glob("*.json"))
    if not all_files:
        return None

    import re as _re

    def _ts_key(p):
        m = _re.search(r"(\d{8}_\d{6})", p.name)
        return m.group(1) if m else "00000000_000000"

    # If a domain was supplied, filter to files whose CONTENT domain matches.
    # Reading the first 512 bytes is enough to find the "domain" field which
    # is always written first. This is more reliable than filename matching
    # because filenames can contain other domain names from past bugs.
    # Falls back to ALL files if nothing matches so UI never gets stuck.
    if domain:
        d_lower = domain.lower()
        safe    = d_lower.replace(".", "_")   # flexifunnels_com  (for filename fallback)

        # Primary: match by domain value inside the JSON
        content_matches = []
        for f in all_files:
            try:
                with open(f, "r", encoding="utf-8") as fh:
                    head = fh.read(512)
                m = _re.search(r'"domain"\s*:\s*"([^"]*)"', head)
                if m and m.group(1).lower() == d_lower:
                    content_matches.append(f)
            except Exception:
                pass

        # Secondary fallback: filename contains domain (handles edge cases)
        if not content_matches:
            content_matches = [
                f for f in all_files
                if safe in f.name.lower() or d_lower in f.name.lower()
            ]

        candidate_files = content_matches if content_matches else all_files
    else:
        candidate_files = all_files

    files_by_ts = sorted(candidate_files, key=_ts_key)
    latest_file = files_by_ts[-1]

    print(f"[load-crawl] {len(all_files)} total crawl files, "
          f"{len(candidate_files)} matched domain='{domain}':")
    for f in files_by_ts:
        marker = " ← LATEST" if f == latest_file else ""
        print(f"  {f.name}{marker}")

    try:
        with open(latest_file, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data
    except Exception as e:
        print(f"[load-crawl] ERROR reading {latest_file.name}: {e}")
        return None


# ── Save recon findings (subdomains discovered by recon tools) ────────────────

class SaveReconFindingsRequest(BaseModel):
    folder:     str
    source:     str          # "tech" | "ports" | "dns" | "wayback" etc.
    subdomains: list = []    # any new subdomains discovered
    extra_file: str = ""     # optional filename to write inside recon/
    extra_data: dict = {}    # optional extra JSON to save

@router.post("/save-recon-findings")
async def save_recon_findings(body: SaveReconFindingsRequest):
    """
    Merge recon-discovered subdomains into subdomains.txt
    and optionally write a findings file under recon/.
    """
    tgt_dir = Path(body.folder)
    if not tgt_dir.exists():
        raise HTTPException(404, "Target folder not found")

    new_subs = sorted(set(s.strip() for s in body.subdomains if s.strip()))

    # Merge into subdomains.txt
    merged_count = 0
    if new_subs:
        subs_file = tgt_dir / "subdomains.txt"
        existing = set()
        if subs_file.exists():
            with open(subs_file, "r", encoding="utf-8") as f:
                existing = {l.strip() for l in f if l.strip()}
        merged = sorted(existing | set(new_subs))
        with open(subs_file, "w", encoding="utf-8") as f:
            f.write("\n".join(merged))
        merged_count = len(merged)

        # Update meta
        meta = _read_meta(body.folder)
        meta["total_subdomains"] = merged_count
        meta["updated_at"] = datetime.utcnow().isoformat()
        _write_meta(body.folder, meta)

    # Write extra findings file if provided
    if body.extra_file and body.extra_data:
        recon_dir = tgt_dir / "recon"
        recon_dir.mkdir(exist_ok=True)
        out = recon_dir / body.extra_file
        with open(out, "w", encoding="utf-8") as f:
            json.dump({"source": body.source, "saved_at": datetime.utcnow().isoformat(), **body.extra_data}, f, indent=2, default=str)

    return {"ok": True, "new_subdomains": len(new_subs), "total_subdomains": merged_count}