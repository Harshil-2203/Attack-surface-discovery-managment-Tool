import { useState, useEffect } from "react";
import axios from "axios";
import GraphViewer from "./GraphViewer";
import MetaViewer from "./MetaViewer";
import Sidebar from "./Sidebar";
import CrawlViewer from "./CrawlViewer";
import TargetManager, { saveRecent } from "./Targetmanager";
import TargetDashboard from "./TargetDashboard";
import TechDetectView from "./TechDetectView";
import PortScanView from "./PortScanView";
import DNSView from "./DNSView";
import JSAnalyzerView from "./JSAnalyzerView";
import WaybackView from "./WaybackView";
import NotesPanel from "./NotesPanel";

const API = "http://localhost:8000";

function App() {
  // ── Target session ────────────────────────────────────────────────────────
  const [targetData, setTargetData] = useState(null);
  const [theme, setTheme]           = useState("dark");

  const [domain, setDomain]         = useState("");
  const [viewMode, setViewMode]     = useState("dashboard");

  // Scan state
  const [results, setResults]             = useState(null);
  const [loading, setLoading]             = useState(false);
  const [mappingResult, setMappingResult] = useState(null);
  const [mappingLoading, setMappingLoading] = useState(false);

  // Crawl state
  const [crawlData, setCrawlData]       = useState(null);
  const [crawlLoading, setCrawlLoading] = useState(false);

  // Lifted results for new views (persist across navigation)
  const [techResults,    setTechResults]    = useState(null);
  const [portResults,    setPortResults]    = useState(null);
  const [dnsResults,     setDnsResults]     = useState(null);
  const [whoisData,      setWhoisData]      = useState(null);
  const [jsResults,      setJsResults]      = useState(null);
  const [waybackData,    setWaybackData]    = useState(null);

  const [error, setError] = useState("");

  // ── Theme ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    document.documentElement.style.setProperty("--bg", theme === "dark" ? "#000" : "#f8fafc");
    document.documentElement.style.setProperty("--fg", theme === "dark" ? "#4ade80" : "#166534");
  }, [theme]);

  // ── Target ready ──────────────────────────────────────────────────────────
  const handleTargetReady = (data) => {
    // Set UI state immediately — don't block on any async work
    setTargetData(data);
    setDomain(data.meta.primary_domain || "");
    setViewMode("dashboard");

    if (data.scans?.length > 0) {
      const latest = data.scans[data.scans.length - 1];
      setResults(latest);
      // Build graph in background — doesn't block opening
      if (latest.subdomains?.length > 0) {
        setMappingLoading(true);
        axios.post(`${API}/map`, { domain: latest.domain || data.meta.primary_domain, subdomains: latest.subdomains })
          .then(r => setMappingResult(r.data.mapping))
          .catch(() => {})
          .finally(() => setMappingLoading(false));
      }
    }

    // Restore crawl lazily — full crawl JSON is too big to include in open payload
    if (data.meta?.target_folder && (data.crawls?.length > 0)) {
      axios.get(`${API}/targets/load-crawl?folder=${encodeURIComponent(data.meta.target_folder)}`)
        .then(r => { if (r.data) setCrawlData(r.data); })
        .catch(() => {});
    }

    // Restore saved recon results in background — each independently
    if (data.meta?.target_folder) {
      const folder = data.meta.target_folder;
      const loadRecon = (type, setter) => {
        axios.get(`${API}/recon/load?target_folder=${encodeURIComponent(folder)}&result_type=${type}`)
          .then(r => { if (r.data) setter(r.data); })
          .catch(() => {});
      };
      loadRecon("tech",    setTechResults);
      loadRecon("ports",   setPortResults);
      loadRecon("dns",     setDnsResults);
      loadRecon("whois",   setWhoisData);
      loadRecon("js",      setJsResults);
      loadRecon("wayback", setWaybackData);
    }
  };

  // ── Auto-save helpers for recon results ──────────────────────────────────
  const saveRecon = (type, data) => {
    if (!data || !targetData?.meta?.target_folder) return;
    axios.post(`${API}/recon/save`, {
      target_folder: targetData.meta.target_folder,
      result_type: type,
      data,
    }).catch(console.error);
  };

  // Save recon-discovered subdomains + findings into target folder
  const saveReconFindings = (source, data) => {
    if (!data || !targetData?.meta?.target_folder) return;
    const folder = targetData.meta.target_folder;

    let subdomains = [];
    let extra_file = "";
    let extra_data = {};

    if (source === "tech") {
      subdomains = Object.keys(data);
      extra_file = "tech_findings.json";
      extra_data = { technologies: data };
    } else if (source === "ports") {
      subdomains = Object.keys(data).filter(k => data[k]?.open_ports?.length > 0);
      extra_file = "port_findings.json";
      extra_data = { hosts: data };
    } else if (source === "dns") {
      subdomains = Object.keys(data);
      extra_file = "dns_findings.json";
      extra_data = { records: data };
    } else if (source === "wayback") {
      subdomains = Object.keys(data?.subdomains || {});
      extra_file = "wayback_findings.json";
      extra_data = { timeline: data };
    } else if (source === "js") {
      extra_file = "js_findings.json";
      extra_data = data;
    }

    axios.post(`${API}/targets/save-recon-findings`, {
      folder, source, subdomains, extra_file, extra_data,
    }).catch(console.error);
  };

  const handleTechResults  = (d) => { setTechResults(d);  saveRecon("tech",    d); saveReconFindings("tech",    d); };
  const handlePortResults  = (d) => { setPortResults(d);  saveRecon("ports",   d); saveReconFindings("ports",   d); };
  const handleDnsResults   = (d) => { setDnsResults(d);   saveRecon("dns",     d); saveReconFindings("dns",     d); };
  const handleWhoisData    = (d) => { setWhoisData(d);    saveRecon("whois",   d); };
  const handleJsResults    = (d) => { setJsResults(d);    saveRecon("js",      d); saveReconFindings("js",      d); };
  const handleWaybackData  = (d) => { setWaybackData(d);  saveRecon("wayback", d); saveReconFindings("wayback", d); };

  // ── Gate: show TargetManager until a target is loaded ────────────────────
  if (!targetData) return <TargetManager onReady={handleTargetReady} />;
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

      if (targetMeta.target_folder) {
        axios.post(`${API}/targets/save-scan`, { folder: targetMeta.target_folder, domain, result: scanData })
          .then(r => saveRecent({ ...targetMeta, ...r.data })).catch(console.error);
      }

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
      if (targetMeta.target_folder) {
        axios.post(`${API}/targets/save-crawl`, { folder: targetMeta.target_folder, domain: target.trim(), result: resp.data })
          .then(r => saveRecent({ ...targetMeta, ...r.data })).catch(console.error);
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
        <h1 className="font-mono text-sm font-bold tracking-widest text-green-400">ASDMT</h1>
        <div className="flex items-center gap-4 font-mono text-xs text-gray-600">
          <span>OP: <span className="text-green-600">{targetMeta.analyst_name}</span></span>
          <span>TARGET: <span className="text-yellow-500">{targetMeta.org_name}</span></span>
          <span>DOMAIN: <span className="text-cyan-600">{targetMeta.primary_domain}</span></span>
          <span className="text-gray-700">{targetMeta.target_id}</span>
          <button onClick={() => { setTargetData(null); setResults(null); setCrawlData(null); setMappingResult(null); setTechResults(null); setPortResults(null); setDnsResults(null); setWhoisData(null); setJsResults(null); setWaybackData(null); setViewMode("dashboard"); }}
            className="border border-gray-800 px-2 py-1 rounded text-gray-700 hover:text-red-500 transition">
            ✕ Close
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
            theme={theme}
            onToggleTheme={() => setTheme(t => t === "dark" ? "light" : "dark")}
            techReady={!!techResults}
            portReady={!!portResults}
            dnsReady={!!dnsResults}
            jsReady={!!jsResults}
            waybackReady={!!waybackData}
          />
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto px-8 py-8 bg-gradient-to-br from-black via-gray-950 to-black">
          <div className="max-w-5xl mx-auto">

            {/* Search bar — only on scan-centric pages */}
            {["dashboard", "list", "graph", "meta"].includes(viewMode) && (
              <div style={{ background: "#080c10", border: "1px solid #0f1923", borderRadius: 16, padding: "16px 20px", marginBottom: 20 }}>
                <div style={{ display: "flex", gap: 10 }}>
                  <input
                    type="text"
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleScan()}
                    placeholder="Enter domain to scan (e.g., example.com)"
                    style={{
                      flex: 1, padding: "10px 16px",
                      background: "#050507", border: "1px solid #0f1923",
                      borderRadius: 10, color: "#4ade80",
                      fontFamily: "monospace", fontSize: 13,
                      outline: "none", transition: "border-color 0.2s",
                    }}
                    onFocus={e => e.target.style.borderColor = "#166534"}
                    onBlur={e => e.target.style.borderColor = "#0f1923"}
                  />
                  <button
                    onClick={handleScan}
                    disabled={loading || mappingLoading}
                    style={{
                      padding: "10px 28px", borderRadius: 10, cursor: loading ? "not-allowed" : "pointer",
                      fontFamily: "monospace", fontSize: 13, fontWeight: 700,
                      background: loading ? "#0d1117" : "linear-gradient(135deg, #166534, #15803d)",
                      border: `1px solid ${loading ? "#1f2937" : "#22c55e55"}`,
                      color: loading ? "#374151" : "#fff",
                      boxShadow: loading ? "none" : "0 0 20px #22c55e22",
                      transition: "all 0.2s", minWidth: 110,
                    }}
                  >
                    {loading ? "Scanning…" : mappingLoading ? "Analyzing…" : results ? "↺ Re-Scan" : "Scan"}
                  </button>
                </div>
                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                  {loading && <ProgressBar color="bg-green-500" label="Scanning subdomains & fetching metadata..." />}
                  {mappingLoading && <ProgressBar color="bg-blue-500" label="Clustering subdomains & building graph..." />}
                  {crawlLoading && <ProgressBar color="bg-purple-500" label="Running GAU + Waybackurls + Katana..." />}
                </div>
                {error && (
                  <div style={{ marginTop: 10, color: "#f87171", padding: "8px 12px", background: "#1c0505", borderRadius: 8, fontFamily: "monospace", fontSize: 12 }}>{error}</div>
                )}
              </div>
            )}

            {/* ── Page content ── */}

            {/* Dashboard */}
            {viewMode === "dashboard" && (
              <TargetDashboard
                target={targetMeta}
                results={results}
                crawlData={crawlData}
                scans={targetData.scans}
                crawls={targetData.crawls}
                onNavigate={setViewMode}
              />
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

            {viewMode === "tech" && (
              <TechDetectView subdomains={results?.subdomains || []} targetFolder={targetMeta.target_folder} savedResults={techResults} onResultsChange={handleTechResults} />
            )}
            {viewMode === "ports" && (
              <PortScanView subdomains={results?.subdomains || []} savedResults={portResults} onResultsChange={handlePortResults} />
            )}
            {viewMode === "dns" && (
              <DNSView subdomains={results?.subdomains || []} primaryDomain={domain} savedDns={dnsResults} savedWhois={whoisData} onDnsChange={handleDnsResults} onWhoisChange={handleWhoisData} />
            )}
            {viewMode === "js" && (
              <JSAnalyzerView crawlData={crawlData} savedResults={jsResults} onResultsChange={handleJsResults} />
            )}
            {viewMode === "wayback" && (
              <WaybackView primaryDomain={domain} subdomains={results?.subdomains || []} savedData={waybackData} onDataChange={handleWaybackData} />
            )}
            {viewMode === "notes" && (
              <NotesPanel targetFolder={targetMeta.target_folder} subdomains={results?.subdomains || []} />
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
  const handleCopy = (s) => { navigator.clipboard.writeText(s); setCopied(s); setTimeout(() => setCopied(null), 1500); };
  const handleCopyAll = () => { navigator.clipboard.writeText(subdomains.join("\n")); setCopiedAll(true); setTimeout(() => setCopiedAll(false), 1500); };
  return (
    <div className="bg-gray-900 border border-gray-800 p-6 rounded-2xl">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-green-400">Subdomain List</h3>
        <button onClick={handleCopyAll} style={{ padding: "4px 12px", background: "#111827", border: "1px solid #374151", borderRadius: 6, color: copiedAll ? "#4ade80" : "#6b7280", fontFamily: "monospace", fontSize: 11, cursor: "pointer" }}>
          {copiedAll ? "✓ Copied all" : `Copy all (${subdomains.length})`}
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[500px] overflow-y-auto">
        {subdomains.map((sub, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#1f2937", padding: "8px 12px", borderRadius: 10 }}>
            <span style={{ fontFamily: "monospace", fontSize: 13, color: "#67e8f9", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginRight: 6 }}>{sub}</span>
            <button onClick={() => handleCopy(sub)} style={{ flexShrink: 0, fontFamily: "monospace", fontSize: 11, color: copied === sub ? "#4ade80" : "#4b5563", background: "none", border: "none", cursor: "pointer", padding: "0 4px" }}>
              {copied === sub ? "✓" : "copy"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;