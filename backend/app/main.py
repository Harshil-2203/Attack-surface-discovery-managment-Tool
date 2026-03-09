from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os


# ── Import engines ────────────────────────────────────────────────────────────
# Adjust these import paths to match YOUR project structure.
# If your files are at:
#   modules/crawl/engine.py       → use:  from modules.crawl.engine import run_crawl
#   crawl/engine.py               → use:  from crawl.engine import run_crawl
#   (same file, both exist)       → pick ONE — they are identical

from app.modules.crawl.engine import run_crawl
from app.modules.subdomain.engine import run_subdomain_scan
from app.modules.subdomain.mapper import analyze_relationships
from app.routers import targets
from app.routers import recon


app = FastAPI(title="Attack Surface Discovery API")

# ── CORS ──────────────────────────────────────────────────────────────────────
# Default: allow Vite dev server on common ports across all platforms.
# Override with env var for team/VM setups:
#   Windows:  set CORS_ORIGINS=http://192.168.1.5:5173 && uvicorn ...
#   Linux:    CORS_ORIGINS=http://192.168.1.5:5173 uvicorn ...
_env_origins = os.getenv("CORS_ORIGINS", "")
if _env_origins:
    _allowed_origins = [o.strip() for o in _env_origins.split(",") if o.strip()]
else:
    _allowed_origins = [
        "http://localhost:5173",  # Vite default
        "http://localhost:5174",  # Vite fallback port
        "http://localhost:3000",  # CRA / other dev servers
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://127.0.0.1:3000",
    ]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(targets.router)
app.include_router(recon.router)
# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/scan/{domain}")
async def scan(domain: str):
    """Subdomain discovery + HTTP metadata."""
    result = await run_subdomain_scan(domain)
    return result


@app.post("/map")
async def map_subdomains(body: dict):
    """Build cluster/graph mapping for a list of subdomains."""
    domain = body.get("domain", "")
    subdomains = body.get("subdomains", [])
    mapping = analyze_relationships(subdomains, domain)
    return {"mapping": mapping}


@app.get("/crawl/{domain:path}")
async def crawl(domain: str):
    """
    URL crawl using GAU + Waybackurls + Katana.
    
    Uses {domain:path} so that subdomains like api.example.com
    are captured correctly instead of being truncated.
    
    This can take 1-2 minutes — the frontend shows a progress bar.
    """
    result = await run_crawl(domain)
    return result


@app.get("/health")
async def health():
    return {"status": "ok"}