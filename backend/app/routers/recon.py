# routers/recon.py
"""
All new recon feature routes:
  POST /recon/techdetect       — technology detection (single or bulk)
  POST /recon/portscan         — port scanning
  GET  /recon/dns/{subdomain}  — DNS records
  GET  /recon/whois/{domain}   — WHOIS lookup
  POST /recon/jsanalyze        — JS file analysis
  GET  /recon/timeline/{domain} — Wayback timeline
  GET  /recon/snapshots/{subdomain} — Wayback snapshots
  POST /recon/notes            — save notes
  GET  /recon/notes/{target_id} — load notes
  POST /recon/diff             — diff two scan results
"""
import json
import os
from pathlib import Path
from datetime import datetime
from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Optional

router = APIRouter(prefix="/recon", tags=["recon"])

# Lazy imports so missing optional deps don't crash startup
def _techdetect():
    from app.modules.recon.techdetect import detect_bulk, detect_technologies
    return detect_bulk, detect_technologies

def _portscan():
    from app.modules.recon.portscan import scan_host, scan_bulk
    return scan_host, scan_bulk

def _dnsrecords():
    from app.modules.recon.dnsrecords import get_dns_bulk, _resolve
    return get_dns_bulk, _resolve

def _whois():
    from app.modules.recon.whois_lookup import whois_lookup
    return whois_lookup

def _jsanalyzer():
    from app.modules.recon.jsanalyzer import analyze_js_files
    return analyze_js_files

def _wayback():
    from app.modules.recon.wayback_timeline import get_timeline, get_subdomain_snapshots
    return get_timeline, get_subdomain_snapshots


# ── Models ────────────────────────────────────────────────────────────────────

class SubdomainListRequest(BaseModel):
    subdomains: List[str]

class PortScanRequest(BaseModel):
    subdomains: List[str]
    ports: Optional[List[int]] = None

class JSAnalyzeRequest(BaseModel):
    js_urls: List[str]
    max_files: int = 1000

class NoteRequest(BaseModel):
    target_folder: str
    subdomain: str
    note: str

class DiffRequest(BaseModel):
    old_subdomains: List[str]
    new_subdomains: List[str]


# ── Tech Detection ────────────────────────────────────────────────────────────

@router.post("/techdetect")
async def techdetect(body: SubdomainListRequest):
    detect_bulk, _ = _techdetect()
    lookup_exploits = getattr(body, "lookup_exploits", True)
    results = await detect_bulk(body.subdomains, lookup_exploits=lookup_exploits)
    return results

@router.get("/techdetect/{subdomain:path}")
async def techdetect_single(subdomain: str):
    _, detect_single = _techdetect()
    return await detect_single(subdomain)


# ── Port Scanner ──────────────────────────────────────────────────────────────

@router.post("/portscan")
async def portscan(body: PortScanRequest):
    _, scan_bulk = _portscan()
    results = await scan_bulk(body.subdomains, body.ports)
    return results

@router.get("/portscan/{subdomain:path}")
async def portscan_single(subdomain: str):
    scan_host, _ = _portscan()
    return await scan_host(subdomain)


# ── DNS Records ───────────────────────────────────────────────────────────────

@router.get("/dns/{subdomain:path}")
async def dns_records(subdomain: str):
    _, resolve_single = _dnsrecords()
    import asyncio
    return await asyncio.to_thread(lambda: asyncio.run(resolve_single(subdomain)))

@router.post("/dns/bulk")
async def dns_bulk(body: SubdomainListRequest):
    get_dns_bulk, _ = _dnsrecords()
    return await get_dns_bulk(body.subdomains)


# ── WHOIS ─────────────────────────────────────────────────────────────────────

@router.get("/whois/{domain:path}")
async def whois(domain: str):
    fn = _whois()
    return await fn(domain)


# ── JS Analyzer ───────────────────────────────────────────────────────────────

@router.post("/jsanalyze")
async def jsanalyze(body: JSAnalyzeRequest):
    fn = _jsanalyzer()
    return await fn(body.js_urls, max_files=body.max_files)


# ── Wayback Timeline ──────────────────────────────────────────────────────────

@router.get("/timeline/{domain:path}")
async def wayback_timeline(domain: str):
    get_timeline, _ = _wayback()
    return await get_timeline(domain)

@router.get("/snapshots/{subdomain:path}")
async def wayback_snapshots(subdomain: str):
    _, get_snaps = _wayback()
    return await get_snaps(subdomain)


# ── Notes (persisted to target folder) ───────────────────────────────────────

@router.post("/notes")
async def save_note(body: NoteRequest):
    notes_file = Path(body.target_folder) / "notes.json"
    notes = {}
    if notes_file.exists():
        try:
            with open(notes_file) as f:
                notes = json.load(f)
        except Exception:
            notes = {}
    notes[body.subdomain] = {"text": body.note, "updated_at": datetime.utcnow().isoformat()}
    with open(notes_file, "w") as f:
        json.dump(notes, f, indent=2)
    return {"ok": True}

@router.get("/notes")
async def get_notes(target_folder: str):
    notes_file = Path(target_folder) / "notes.json"
    if not notes_file.exists():
        return {}
    try:
        with open(notes_file) as f:
            return json.load(f)
    except Exception:
        return {}

class DeleteNoteRequest(BaseModel):
    target_folder: str
    subdomain: str

@router.delete("/notes")
async def delete_note(body: DeleteNoteRequest):
    notes_file = Path(body.target_folder) / "notes.json"
    if not notes_file.exists():
        return {"ok": False, "error": "No notes file found"}
    try:
        with open(notes_file) as f:
            notes = json.load(f)
        if body.subdomain not in notes:
            return {"ok": False, "error": "Note not found"}
        del notes[body.subdomain]
        with open(notes_file, "w") as f:
            json.dump(notes, f, indent=2)
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}

# ── Rescan Diff ───────────────────────────────────────────────────────────────

@router.post("/diff")
async def diff_scans(body: DiffRequest):
    old = set(body.old_subdomains)
    new = set(body.new_subdomains)
    return {
        "added":    sorted(new - old),
        "removed":  sorted(old - new),
        "unchanged": sorted(old & new),
        "added_count":   len(new - old),
        "removed_count": len(old - new),
        "unchanged_count": len(old & new),
    }


# ── Recon Results Persistence (to target folder) ──────────────────────────────

class SaveReconRequest(BaseModel):
    target_folder: str
    result_type: str   # tech | ports | dns | whois | js | wayback
    data: dict

@router.post("/save")
async def save_recon(body: SaveReconRequest):
    """Save any recon result type to the target folder as JSON."""
    tgt = Path(body.target_folder)
    if not tgt.exists():
        return {"ok": False, "error": "Target folder not found"}
    recon_dir = tgt / "recon"
    recon_dir.mkdir(exist_ok=True)
    out = recon_dir / f"{body.result_type}.json"
    # Wrap in envelope so raw data is always under "data" key
    with open(out, "w", encoding="utf-8") as f:
        json.dump({"saved_at": datetime.utcnow().isoformat(), "data": body.data}, f, indent=2, default=str)
    return {"ok": True, "file": str(out)}

@router.get("/load")
async def load_recon(target_folder: str, result_type: str):
    """Load a previously saved recon result — returns only the raw data dict."""
    out = Path(target_folder) / "recon" / f"{result_type}.json"
    if not out.exists():
        return None
    with open(out, "r", encoding="utf-8") as f:
        envelope = json.load(f)
    # Support both old format (flat) and new format (envelope with "data" key)
    if "data" in envelope and "saved_at" in envelope:
        return envelope["data"]
    # Old flat format — strip saved_at if present
    envelope.pop("saved_at", None)
    return envelope


# ── IDOR Parameter Analysis ───────────────────────────────────────────────────

class IDORRequest(BaseModel):
    urls: list   # list of crawled URLs

@router.post("/idor")
async def analyze_idor(body: IDORRequest):
    """
    Analyse crawled URLs and return ranked IDOR parameter candidates.
    Filters out junk/tracking/display params automatically.
    """
    try:
        from app.modules.idor_analyzer import analyze_idor_params
    except ImportError:
        from app.modules.idor_analyzer import analyze_idor_params
    return analyze_idor_params(body.urls)