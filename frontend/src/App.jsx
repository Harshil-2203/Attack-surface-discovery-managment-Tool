import { useState } from "react";
import axios from "axios";
import GraphViewer from "./GraphViewer";
import MetaViewer from "./MetaViewer";
import Sidebar from "./Sidebar";
import CrawlViewer from "./CrawlViewer";
import TargetManager, { saveRecent } from "./TargetManager";

const API = "http://localhost:8000";

function App() {
  // ── Target (session) state ────────────────────────────────────────────────
  const [targetData, setTargetData] = useState(null); // null = show TargetManager

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

  // ── Target ready callback ─────────────────────────────────────────────────
  const handleTargetReady = async (data) => {
    setTargetData(data);
    const dom = data.meta.primary_domain || "";
    setDomain(dom);

    // Restore latest scan result if any
    if (data.scans && data.scans.length > 0) {
      const latest = data.scans[data.scans.length - 1];
      setResults(latest);
      setViewMode("list");

      // Re-run mapping so graph is available
      if (latest.subdomains && latest.subdomains.length > 0) {
        setMappingLoading(true);
        try {
          const mapResp = await axios.post(`${API}/map`, {
            domain: latest.domain || dom,
            subdomains: latest.subdomains,
          });
          setMappingResult(mapResp.data.mapping);
        } catch (e) {
          console.error("Mapping restore failed", e);
        } finally {
          setMappingLoading(false);
        }
      }
    }

    // Restore latest crawl result if any
    if (data.crawls && data.crawls.length > 0) {
      setCrawlData(data.crawls[data.crawls.length - 1]);
    }
  };

  // Show TargetManager until a target is selected/created
  if (!targetData) {
    return <TargetManager onReady={handleTargetReady} />;
  }

  const targetMeta = targetData.meta;

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

      // Auto-save scan to target folder
      if (targetMeta.target_folder) {
        axios.post(`${API}/targets/save-scan`, {
          folder: targetMeta.target_folder,
          domain,
          result: scanData,
        }).then(r => {
          // Update recent cache with new stats
          saveRecent({ ...targetMeta, ...r.data });
        }).catch(console.error);
      }

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

      // Auto-save crawl to target folder
      if (targetMeta.target_folder) {
        axios.post(`${API}/targets/save-crawl`, {
          folder: targetMeta.target_folder,
          domain: target.trim(),
          result: resp.data,
        }).then(r => saveRecent({ ...targetMeta, ...r.data })).catch(console.error);
      }
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
      <header className="px-6 py-3 border-b border-gray-800 bg-black shrink-0 flex items-center justify-between">
        <h1 className="font-mono text-sm font-bold tracking-widest text-green-400">
          ASDMT
        </h1>
        <div className="flex items-center gap-5 font-mono text-xs">
          <span className="text-gray-700">OP: <span className="text-green-600">{targetMeta.analyst_name}</span></span>
          <span className="text-gray-700">TARGET: <span className="text-yellow-500">{targetMeta.org_name}</span></span>
          <span className="text-gray-700">DOMAIN: <span className="text-cyan-600">{targetMeta.primary_domain}</span></span>
          <span className="text-gray-700">ID: <span className="text-gray-600 text-xs">{targetMeta.target_id}</span></span>
          <span className="text-gray-700">SCANS: <span className="text-green-700">{targetMeta.scan_count || 0}</span></span>
          <span className="text-gray-700">SUBS: <span className="text-green-700">{targetMeta.total_subdomains || 0}</span></span>
          <span className="text-gray-700">URLs: <span className="text-green-700">{targetMeta.total_urls || 0}</span></span>
          <button
            onClick={() => { setTargetData(null); setResults(null); setCrawlData(null); setMappingResult(null); setViewMode("welcome"); }}
            className="text-gray-700 hover:text-red-500 transition border border-gray-800 px-2 py-1 rounded text-xs font-mono"
          >
            ✕ Close Target
          </button>
        </div>
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
  const [copied, setCopied] = useState(null);
  const [copiedAll, setCopiedAll] = useState(false);

  const handleCopy = (sub) => {
    navigator.clipboard.writeText(sub);
    setCopied(sub);
    setTimeout(() => setCopied(null), 1500);
  };
  const handleCopyAll = () => {
    navigator.clipboard.writeText(subdomains.join("\n"));
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 1500);
  };

  return (
    <div className="bg-gray-900 border border-gray-800 p-6 rounded-2xl">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-green-400">Subdomain List</h3>
        <button
          onClick={handleCopyAll}
          style={{ padding: "4px 12px", background: "#111827", border: "1px solid #374151", borderRadius: 6, color: copiedAll ? "#4ade80" : "#6b7280", fontFamily: "monospace", fontSize: 11, cursor: "pointer" }}
        >
          {copiedAll ? "✓ Copied all" : `Copy all (${subdomains.length})`}
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[500px] overflow-y-auto">
        {subdomains.map((sub, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#1f2937", padding: "8px 12px", borderRadius: 10 }}>
            <span style={{ fontFamily: "monospace", fontSize: 13, color: "#67e8f9", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginRight: 6 }}>{sub}</span>
            <button
              onClick={() => handleCopy(sub)}
              style={{ flexShrink: 0, fontFamily: "monospace", fontSize: 11, color: copied === sub ? "#4ade80" : "#4b5563", background: "none", border: "none", cursor: "pointer", padding: "0 4px" }}
            >
              {copied === sub ? "✓" : "copy"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;