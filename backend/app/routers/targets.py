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

    # Load all scans (sorted oldest → newest)
    scans = []
    scans_dir = tgt_dir / "scans"
    scans_dir.mkdir(exist_ok=True)
    for f in sorted(scans_dir.glob("*.json")):
        try:
            with open(f, "r", encoding="utf-8") as fh:
                scans.append(json.load(fh))
        except Exception:
            pass

    # Load all crawls
    crawls = []
    crawls_dir = tgt_dir / "crawls"
    crawls_dir.mkdir(exist_ok=True)
    for f in sorted(crawls_dir.glob("*.json")):
        try:
            with open(f, "r", encoding="utf-8") as fh:
                crawls.append(json.load(fh))
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

    filename = f"crawl_{body.domain.replace('.','_')}_{_ts()}.json"
    with open(tgt_dir / "crawls" / filename, "w", encoding="utf-8") as f:
        json.dump({
            "domain":   body.domain,
            "saved_at": datetime.utcnow().isoformat(),
            **body.result
        }, f, indent=2, default=str)

    # Merge into urls.txt
    urls_file = tgt_dir / "urls.txt"
    existing  = set()
    if urls_file.exists():
        with open(urls_file, "r", encoding="utf-8") as f:
            existing = {l.strip() for l in f if l.strip()}
    new_urls = set(body.result.get("urls", []))
    merged   = sorted(existing | new_urls)
    with open(urls_file, "w", encoding="utf-8") as f:
        f.write("\n".join(merged))

    # Update meta
    meta = _read_meta(body.folder)
    meta["crawl_count"]  += 1
    meta["total_urls"]    = len(merged)
    meta["updated_at"]    = datetime.utcnow().isoformat()
    _write_meta(body.folder, meta)

    return {"ok": True, "file": filename, "total_urls": len(merged)}