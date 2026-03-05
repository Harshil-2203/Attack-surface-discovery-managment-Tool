import asyncio
import sys
import os
import json
from pathlib import Path

from fastapi import FastAPI
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware

from app.modules.subdomain.mapper import analyze_relationships
from app.modules.subdomain.engine import run_subdomain_scan
from app.modules.crawl.engine import run_crawl

# Windows: ProactorEventLoop required for subprocesses
if sys.platform.startswith("win"):
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

MAPPINGS_DIR = Path("mappings")
MAPPINGS_DIR.mkdir(exist_ok=True)

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─────────────────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"message": "Backend running 🚀"}

@app.get("/health")
def health():
    return {"status": "ok"}


# ── Debug: check if tools are visible to Python ───────────────────────────────

@app.get("/debug-tools")
def debug_tools():
    """
    Call this in your browser: http://localhost:8000/debug-tools
    Shows whether gau, waybackurls, katana are found by Python.
    """
    tools = ["gau", "waybackurls", "katana"]
    result = {}
    for t in tools:
        path = _find_exe(t)
        result[t] = path if path else "NOT FOUND"

    return {
        "tools": result,
        "python_PATH": os.environ.get("PATH", "").split(os.pathsep),
        "searched_dirs": _get_go_bin_paths(),
        "cwd": os.getcwd(),
        "platform": sys.platform,
    }


# ── Scan ──────────────────────────────────────────────────────────────────────

@app.get("/scan/{domain}")
async def scan_domain(domain: str):
    return await run_subdomain_scan(domain)


# ── Mapping ───────────────────────────────────────────────────────────────────

class MappingRequest(BaseModel):
    domain: str
    subdomains: list[str]

@app.post("/map")
async def map_subdomains(req: MappingRequest):
    mapping = analyze_relationships(req.subdomains, req.domain)
    return {"mapping": mapping}


# ── Crawl ─────────────────────────────────────────────────────────────────────

@app.get("/crawl/{domain:path}")
async def crawl_domain(domain: str):
    domain = domain.replace("https://", "").replace("http://", "").rstrip("/")
    return await run_crawl(domain)


# ── Save / Load mapping ───────────────────────────────────────────────────────

class SaveMappingRequest(BaseModel):
    domain: str
    mapping: dict

@app.post("/save-mapping")
async def save_mapping(req: SaveMappingRequest):
    file_path = MAPPINGS_DIR / f"{req.domain}.json"
    with open(file_path, "w") as f:
        json.dump(req.mapping, f, indent=2)
    return {"status": "success", "file": str(file_path)}

@app.get("/load-mapping/{domain}")
async def load_mapping(domain: str):
    file_path = MAPPINGS_DIR / f"{domain}.json"
    if not file_path.exists():
        return {"mapping": None}
    with open(file_path, "r") as f:
        return {"mapping": json.load(f)}