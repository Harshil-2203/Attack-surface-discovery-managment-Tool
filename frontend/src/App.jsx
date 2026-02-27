import { useState } from "react";
import axios from "axios";
import GraphViewer from "./GraphViewer";
import MetaViewer from "./MetaViewer";
import Sidebar from "./Sidebar";

function App() {
  const [domain, setDomain] = useState("");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [viewMode, setViewMode] = useState("list");
  const [mappingResult, setMappingResult] = useState(null);
  const [mappingLoading, setMappingLoading] = useState(false);

  const handleScan = async () => {
    if (!domain.trim()) {
      setError("Please enter a domain");
      return;
    }

    setLoading(true);
    setError("");
    setResults(null);
    setMappingResult(null);

    try {
      const response = await axios.get(
        `http://localhost:8000/scan/${domain}`
      );
      setResults(response.data);

      setMappingLoading(true);
      try {
        const mappingResp = await axios.post(
          "http://localhost:8000/map",
          {
            domain,
            subdomains: response.data.subdomains,
          }
        );
        setMappingResult(mappingResp.data.mapping);
        setViewMode("graph");
      } catch (err) {
        console.error("Mapping failed", err);
      } finally {
        setMappingLoading(false);
      }
    } catch (err) {
      setError("Failed to scan domain. Backend not running?");
    } finally {
      setLoading(false);
    }
  };
return (
  <div className="h-screen bg-black text-green-400 flex flex-col">

    {/* Global Header */}
    <header className="px-10 pt-8 pb-6 border-b border-gray-800 bg-black">
      <h1 className="text-4xl md:text-3xl font-extrabold text-center tracking-wider text-green-400">
       Attack Surface Discovery & Management Tool
      </h1>
      <p className="text-center text-gray-500 mt-2 text-sm">
      </p>
    </header>

    {/* Body Layout */}
    <div className="flex flex-1 overflow-hidden">

      {/* Sidebar */}
      <aside className="w-64 bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950 border-r border-gray-800 shadow-xl">
        <Sidebar
          viewMode={viewMode}
          setViewMode={setViewMode}
          mappingResult={mappingResult}
          results={results}
          loadingStates={{ loading, mappingLoading }}
        />
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto px-10 py-10 bg-gradient-to-br from-black via-gray-950 to-black">

        <div className="max-w-5xl mx-auto bg-gray-900/70 backdrop-blur-xl p-10 rounded-3xl shadow-[0_0_40px_rgba(0,255,150,0.08)] border border-gray-800">

          {/* Search Section */}
          <div className="flex gap-4 mb-6">
            <input
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="Enter domain (e.g., google.com)"
              className="flex-1 px-6 py-4 bg-gray-800 border border-gray-700 rounded-2xl text-green-400 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 transition"
            />

            <button
              onClick={handleScan}
              disabled={loading || mappingLoading}
              className="px-8 py-4 bg-green-600 hover:bg-green-500 active:scale-95 disabled:bg-gray-600 rounded-2xl font-semibold transition-all"
            >
              {loading
                ? "Scanning..."
                : mappingLoading
                ? "Analyzing..."
                : "Scan"}
            </button>
          </div>

            {/* Progress Bar */}
            {loading && (
              <div className="w-full h-1 bg-gray-700 rounded overflow-hidden mb-6">
                <div className="h-full bg-green-500 animate-pulse w-full"></div>
              </div>
            )}

            {error && (
              <div className="text-red-400 mb-4 p-4 bg-red-900/20 rounded-xl">
                {error}
              </div>
            )}

            {/* Results Section */}
            {results && (
              <div className="space-y-8">

                {/* Stats */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <StatCard
                    title="Total Found"
                    value={results.total_found}
                  />
                  <StatCard
                    title="Alive Count"
                    value={results.alive_count}
                  />
                  <StatCard
                    title="Sources"
                    value={Object.keys(results.sources).length}
                  />
                </div>

                {/* Dynamic View Rendering */}
                {viewMode === "list" && (
                  <SubdomainList subdomains={results.subdomains} />
                )}

                {viewMode === "graph" && mappingResult && (
                  <GraphViewer
                    domain={domain}
                    subdomains={results.subdomains}
                    clusters={mappingResult.clusters}
                    meta={results.meta}
                  />
                )}

                {viewMode === "meta" && (
                  <MetaViewer
                    domain={domain}
                    subdomains={results.subdomains}
                    meta={results.meta}
                  />
                )}
              </div>
            )}
          </div>
        </main>
      </div>
      </div>
  );
}

/* ---------- Components ---------- */

function StatCard({ title, value }) {
  return (
    <div className="bg-gradient-to-br from-gray-800 to-gray-900 p-6 rounded-2xl border border-gray-700 shadow-md hover:shadow-[0_0_20px_rgba(0,255,150,0.15)] transition">
      <h3 className="text-gray-400 text-sm mb-2">{title}</h3>
      <p className="text-3xl font-bold text-green-300">{value}</p>
    </div>
  );
}

function SubdomainList({ subdomains }) {
  return (
    <div className="bg-gray-800 p-6 rounded-2xl">
      <h3 className="text-lg font-semibold mb-4">Subdomain List</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-96 overflow-y-auto">
        {subdomains.map((sub, i) => (
          <div
            key={i}
            className="bg-gray-700 px-4 py-3 rounded-lg text-sm hover:bg-gray-600 cursor-pointer transition"
          >
            {sub}
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;