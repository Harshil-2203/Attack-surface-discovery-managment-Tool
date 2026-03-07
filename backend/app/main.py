

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# ── Import engines ────────────────────────────────────────────────────────────
# Adjust these import paths to match YOUR project structure.
# If your files are at:
#   modules/crawl/engine.py       → use:  from modules.crawl.engine import run_crawl
#   crawl/engine.py               → use:  from crawl.engine import run_crawl
#   (same file, both exist)       → pick ONE — they are identical

from app.modules.crawl.engine import run_crawl
from app.modules.subdomain.engine import run_subdomain_scan
from app.modules.subdomain.mapper import analyze_relationships

app = FastAPI(title="Attack Surface Discovery API")

# ── CORS — allow the Vite dev server (port 5173) ─────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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