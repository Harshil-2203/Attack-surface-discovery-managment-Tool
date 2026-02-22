from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.modules.subdomain.engine import run_subdomain_scan

app = FastAPI()

origins = [
    "http://localhost:5173",
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
def scan_domain(domain: str):
    results = run_subdomain_scan(domain)
    return results