from fastapi import FastAPI
from pydantic import BaseModel
from app.modules.subdomain.mapper import analyze_relationships
from fastapi.middleware.cors import CORSMiddleware
from app.modules.subdomain.engine import run_subdomain_scan
import json
import os
from pathlib import Path

# Mappings storage directory
MAPPINGS_DIR = Path("mappings")
MAPPINGS_DIR.mkdir(exist_ok=True)

app = FastAPI()

origins = [
    "http://localhost:5173",
    "http://localhost:5174",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"message": "Backend running successfully 🚀"}

@app.get("/health")
def health_check():
    return {"status": "Backend is healthy"}

@app.get("/scan/{domain}")
async def scan_domain(domain: str):
    results = await run_subdomain_scan(domain)
    return results


class MappingRequest(BaseModel):
    domain: str
    subdomains: list[str]


@app.post("/map")
async def map_subdomains(req: MappingRequest):
    """Compute mapping/ML analysis from provided subdomains."""
    mapping = analyze_relationships(req.subdomains, req.domain)
    return {"mapping": mapping}


class SaveMappingRequest(BaseModel):
    domain: str
    mapping: dict


@app.post("/save-mapping")
async def save_mapping(req: SaveMappingRequest):
    """Save mapping to a JSON file."""
    file_path = MAPPINGS_DIR / f"{req.domain}.json"
    with open(file_path, 'w') as f:
        json.dump(req.mapping, f, indent=2)
    return {"status": "success", "domain": req.domain, "file": str(file_path)}


@app.get("/load-mapping/{domain}")
async def load_mapping(domain: str):
    """Load saved mapping from JSON file."""
    file_path = MAPPINGS_DIR / f"{domain}.json"
    if not file_path.exists():
        return {"mapping": None}
    with open(file_path, 'r') as f:
        mapping = json.load(f)
    return {"mapping": mapping}