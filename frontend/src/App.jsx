import { useState } from "react";
import axios from "axios";
import GraphViewer from "./GraphViewer";
import MetaViewer from "./MetaViewer";
import Sidebar from "./Sidebar";
import CrawlViewer from "./CrawlViewer";

const API = "http://localhost:8000";

function App() {
  const [domain, setDomain] = useState("");
  const [viewMode, setViewMode] = useState("welcome");

  // Scan state
  const [results, setResults]         = useState(null);
  const [loading, setLoading]         = useState(false);

  // Graph/mapping state
  const [mappingResult, setMappingResult]   = useState(null);
  const [mappingLoading, setMappingLoading] = useState(false);

  // Crawl state — triggered from CrawlViewer
  const [crawlData, setCrawlData]     = useState(null);
  const [crawlLoading, setCrawlLoading] = useState(false);

  const [error, setError] = useState("");

  // ── SCAN: fetches subdomains + meta together ────────────────────────────
  const handleScan = async () => {
    if (!domain.trim()) { setError("Please enter a domain"); return; }

    setLoading(true);
    setError("");
    setResults(null);
    setMappingResult(null);
    setCrawlData(null);
    setViewMode("list");

    try {
      // Step 1: scan (returns subdomains + meta in one call)
      const scanResp = await axios.get(`${API}/scan/${domain}`);
      const scanData = scanResp.data;
      setResults(scanData);

      // Step 2: mapping for graph (runs concurrently after scan)
      setMappingLoading(true);
      try {
        const mapResp = await axios.post(`${API}/map`, {
          domain,
          subdomains: scanData.subdomains,
        });
        setMappingResult(mapResp.data.mapping);
      } catch (e) {
        console.error("Mapping failed", e);
      } finally {
        setMappingLoading(false);
      }

    } catch (e) {
      setError("Scan failed — is the backend running on port 8000?");
    } finally {
      setLoading(false);
    }
  };

  // ── CRAWL: called from CrawlViewer when user clicks Start Crawl ─────────
  const handleCrawl = async (target) => {
    if (!target?.trim()) return;
    setCrawlLoading(true);
    setCrawlData(null);
    setError("");
    try {
      const resp = await axios.get(`${API}/crawl/${target.trim()}`);
      setCrawlData(resp.data);
    } catch (e) {
      setError("Crawl failed — check that gau, waybackurls and katana are installed.");
    } finally {
      setCrawlLoading(false);
    }
  };

  const scanDone = !!results;

  return (
    <div className="h-screen bg-black text-green-400 flex flex-col">

      {/* Header */}
      <header className="px-10 pt-7 pb-5 border-b border-gray-800 bg-black shrink-0">
        <h1 className="text-3xl font-extrabold text-center tracking-wider text-green-400">
          Attack Surface Discovery & Management Tool
        </h1>
      </header>

      <div className="flex flex-1 overflow-hidden">

        {/* Sidebar */}
        <aside className="w-64 shrink-0 bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950 border-r border-gray-800">
          <Sidebar
            viewMode={viewMode}
            setViewMode={setViewMode}
            scanDone={scanDone}
            mappingReady={!!mappingResult}
            mappingLoading={mappingLoading}
            crawlData={crawlData}
            crawlLoading={crawlLoading}
          />
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto px-8 py-8 bg-gradient-to-br from-black via-gray-950 to-black">
          <div className="max-w-5xl mx-auto">

            {/* Search bar — always visible */}
            <div className="bg-gray-900/80 border border-gray-800 rounded-3xl p-6 mb-6 shadow-[0_0_40px_rgba(0,255,150,0.05)]">
              <div className="flex gap-3">
                <input
                  type="text"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleScan()}
                  placeholder="Enter domain (e.g., example.com)"
                  className="flex-1 px-5 py-3.5 bg-gray-800 border border-gray-700 rounded-2xl text-green-400 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500 transition text-sm"
                />
                <button
                  onClick={handleScan}
                  disabled={loading || mappingLoading}
                  className="px-8 py-3.5 bg-green-600 hover:bg-green-500 active:scale-95 disabled:bg-gray-700 disabled:text-gray-500 rounded-2xl font-semibold transition-all text-sm"
                >
                  {loading ? "Scanning..." : mappingLoading ? "Analyzing..." : "Scan"}
                </button>
              </div>

              {/* Progress bars stacked */}
              <div className="mt-4 space-y-2">
                {loading && <ProgressBar color="bg-green-500" label="Scanning subdomains & fetching metadata..." />}
                {mappingLoading && <ProgressBar color="bg-blue-500" label="Clustering subdomains & building graph..." />}
                {crawlLoading && <ProgressBar color="bg-purple-500" label="Running GAU + Waybackurls + Katana..." />}
              </div>

              {error && (
                <div className="mt-4 text-red-400 p-3 bg-red-900/20 rounded-xl text-sm">{error}</div>
              )}
            </div>

            {/* ── Page content ── */}

            {/* Welcome screen */}
            {viewMode === "welcome" && (
              <div className="text-center text-gray-600 py-20">
                <p className="text-6xl mb-5">🔍</p>
                <p className="text-xl text-gray-500">Enter a domain and click <span className="text-green-400 font-semibold">Scan</span></p>
                <p className="text-sm mt-3 text-gray-700">Discovers subdomains → fetches metadata → builds graph → ready for URL crawling</p>
              </div>
            )}

            {/* List view */}
            {viewMode === "list" && results && (
              <div className="space-y-6">
                <StatsRow results={results} />
                <SubdomainList subdomains={results.subdomains} />
              </div>
            )}

            {/* Graph view */}
            {viewMode === "graph" && results && (
              <div className="space-y-6">
                <StatsRow results={results} />
                {mappingLoading && (
                  <div className="text-center text-gray-500 py-12 animate-pulse">Building graph clusters...</div>
                )}
                {mappingResult && (
                  <GraphViewer
                    domain={domain}
                    subdomains={results.subdomains}
                    clusters={mappingResult.clusters}
                    meta={results.meta}
                  />
                )}
              </div>
            )}

            {/* Meta view — data already fetched during scan */}
            {viewMode === "meta" && results && (
              <div className="space-y-6">
                <StatsRow results={results} />
                <MetaViewer
                  domain={domain}
                  subdomains={results.subdomains}
                  meta={results.meta}
                />
              </div>
            )}

            {/* Crawl view */}
            {viewMode === "crawl" && (
              <CrawlViewer
                defaultDomain={domain}
                subdomains={results?.subdomains || []}
                crawlData={crawlData}
                crawlLoading={crawlLoading}
                onCrawl={handleCrawl}
              />
            )}

          </div>
        </main>
      </div>
    </div>
  );
}

/* ── Shared UI Components ────────────────────────────────────────────────── */

function ProgressBar({ color, label }) {
  return (
    <div>
      <p className="text-xs text-gray-500 mb-1 animate-pulse">{label}</p>
      <div className="w-full h-1 bg-gray-800 rounded overflow-hidden">
        <div className={`h-full ${color} animate-pulse w-full`} />
      </div>
    </div>
  );
}

function StatsRow({ results }) {
  return (
    <div className="grid grid-cols-3 gap-4">
      <StatCard title="Total Found"  value={results.total_found} />
      <StatCard title="Alive"        value={results.alive_count} />
      <StatCard title="Sources"      value={Object.keys(results.sources).length} />
    </div>
  );
}

function StatCard({ title, value }) {
  return (
    <div className="bg-gradient-to-br from-gray-800 to-gray-900 p-5 rounded-2xl border border-gray-700 hover:shadow-[0_0_20px_rgba(0,255,150,0.1)] transition">
      <p className="text-gray-500 text-xs mb-1">{title}</p>
      <p className="text-3xl font-bold text-green-300">{value}</p>
    </div>
  );
}

function SubdomainList({ subdomains }) {
  return (
    <div className="bg-gray-900 border border-gray-800 p-6 rounded-2xl">
      <h3 className="text-base font-semibold mb-4 text-green-400">Subdomain List</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[500px] overflow-y-auto">
        {subdomains.map((sub, i) => (
          <div key={i} className="bg-gray-800 px-4 py-2.5 rounded-xl text-sm text-cyan-300 font-mono hover:bg-gray-700 cursor-pointer transition truncate">
            {sub}
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;