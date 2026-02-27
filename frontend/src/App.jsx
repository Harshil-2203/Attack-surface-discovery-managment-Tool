import { useState } from 'react';
import axios from 'axios';
import GraphViewer from './GraphViewer';

function TreeNode({ node, level = 0 }) {
  const [expanded, setExpanded] = useState(true);

  const indent = level * 20;
  const hasChildren = node.children && node.children.length > 0;

  return (
    <div>
      <div
        className="flex items-center py-1 hover:bg-gray-800 cursor-pointer"
        style={{ paddingLeft: `${indent}px` }}
        onClick={() => hasChildren && setExpanded(!expanded)}
      >
        {hasChildren && (
          <span className="mr-2 text-cyan-400">
            {expanded ? '▼' : '▶'}
          </span>
        )}
        {!hasChildren && <span className="mr-2 text-gray-600">○</span>}
        <span className={`text-sm ${
          node.type === 'root' ? 'text-green-300 font-bold' :
          node.level === 1 ? 'text-cyan-400' :
          node.level === 2 ? 'text-yellow-400' :
          'text-gray-400'
        }`}>
          {node.name}
        </span>
        {node.type !== 'root' && (
          <span className="ml-2 text-xs text-gray-500">
            (Level {node.level})
          </span>
        )}
      </div>
      {hasChildren && expanded && (
        <div>
          {node.children.map((child, index) => (
            <TreeNode key={index} node={child} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function App() {
  const [domain, setDomain] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState('list'); // 'list' or 'tree'
  const [mappingResult, setMappingResult] = useState(null);
  const [mappingLoading, setMappingLoading] = useState(false);

  const handleScan = async () => {
    if (!domain.trim()) {
      setError('Please enter a domain');
      return;
    }

    setLoading(true);
    setError('');
    setResults(null);
    setMappingResult(null);

    try {
      const response = await axios.get(`http://localhost:8000/scan/${domain}`);
      setResults(response.data);
      
      // Automatically run ML mapping after scan
      setMappingLoading(true);
      try {
        const mappingResp = await axios.post('http://localhost:8000/map', {
          domain,
          subdomains: response.data.subdomains,
        });
        setMappingResult(mappingResp.data.mapping);
        setViewMode('graph');
      } catch (mappingErr) {
        console.error('Auto-mapping failed', mappingErr);
      } finally {
        setMappingLoading(false);
      }
    } catch (err) {
      setError('Failed to scan domain. Make sure the backend is running.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-green-400 p-8">
      <div className="w-full">
        <h1 className="text-4xl font-bold text-center mb-8">
          AI Driven Attack Surface Discovery & Management Tool
        </h1>

        <div className="bg-gray-900 p-6 rounded-lg shadow-lg">
          <div className="flex gap-4 mb-6">
            <input
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="Enter domain (e.g., google.com)"
              className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded text-green-400 placeholder-gray-500 focus:outline-none focus:border-green-400"
            />
            <button
              onClick={handleScan}
              disabled={loading || mappingLoading}
              className="px-6 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 rounded font-semibold transition-colors"
            >
              {loading ? 'Scanning...' : mappingLoading ? 'Analyzing...' : 'Scan'}
            </button>
          </div>

          {error && (
            <div className="text-red-400 mb-4 p-3 bg-red-900/20 rounded">
              {error}
            </div>
          )}

          {results && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gray-800 p-4 rounded">
                  <h3 className="text-lg font-semibold mb-2">Total Found</h3>
                  <p className="text-2xl font-bold text-green-300">{results.total_found}</p>
                </div>
                <div className="bg-gray-800 p-4 rounded">
                  <h3 className="text-lg font-semibold mb-2">Alive Count</h3>
                  <p className="text-2xl font-bold text-cyan-300">{results.alive_count}</p>
                </div>
                <div className="bg-gray-800 p-4 rounded">
                  <h3 className="text-lg font-semibold mb-2">Sources</h3>
                  <div className="space-y-1">
                    {Object.entries(results.sources).map(([source, count]) => (
                      <div key={source} className="flex justify-between">
                        <span className="capitalize">{source}:</span>
                        <span className="text-green-300">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex space-x-4 mb-4">
                <button
                  onClick={() => setViewMode('list')}
                  className={`px-4 py-2 rounded ${
                    viewMode === 'list'
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  List View
                </button>
                <button
                  onClick={() => setViewMode('tree')}
                  className={`px-4 py-2 rounded ${
                    viewMode === 'tree'
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                  disabled={!mappingResult}
                >
                  Tree View
                </button>
                <button
                  onClick={() => setViewMode('patterns')}
                  className={`px-4 py-2 rounded ${
                    viewMode === 'patterns'
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                  disabled={!mappingResult}
                >
                  Patterns
                </button>
                <button
                  onClick={() => setViewMode('graph')}
                  className={`px-4 py-2 rounded ${
                    viewMode === 'graph'
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                  disabled={!mappingResult}
                >
                  Graph Map
                </button>
                <button
                  onClick={async () => {
                    if (!results) return;
                    setMappingLoading(true);
                    try {
                      const resp = await axios.post('http://localhost:8001/map', {
                        domain,
                        subdomains: results.subdomains,
                      });
                      setMappingResult(resp.data.mapping);
                      // Don't switch view, just update the mapping
                    } catch (err) {
                      console.error('Mapping failed', err);
                    } finally {
                      setMappingLoading(false);
                    }
                  }}
                  disabled={!results || mappingLoading}
                  className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-600"
                >
                  {mappingLoading ? 'Mapping...' : 'Refresh ML Mapping'}
                </button>
              </div>

              {/* Content based on view mode */}
              {viewMode === 'list' && (
                <div className="bg-gray-800 p-4 rounded">
                  <h3 className="text-lg font-semibold mb-4">Subdomain List</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-96 overflow-y-auto">
                    {results.subdomains.map((subdomain, index) => (
                      <div key={index} className="bg-gray-700 px-3 py-2 rounded text-sm hover:bg-gray-600 cursor-pointer">
                        {subdomain}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {viewMode === 'tree' && mappingResult && (
                <div className="bg-gray-800 p-4 rounded">
                  <h3 className="text-lg font-semibold mb-4">Domain Hierarchy Tree</h3>
                  <div className="bg-black p-4 rounded border max-h-96 overflow-y-auto">
                    <TreeNode node={mappingResult.tree} />
                  </div>
                  <div className="mt-4 text-sm text-gray-400">
                    <p>• Green: Root domain</p>
                    <p>• Cyan: Level 1 subdomains</p>
                    <p>• Yellow: Level 2 subdomains</p>
                    <p>• Gray: Deeper levels</p>
                    <p>• Click nodes with children to expand/collapse</p>
                  </div>
                </div>
              )}

              {viewMode === 'patterns' && mappingResult && (
                <div className="bg-gray-800 p-4 rounded">
                  <h3 className="text-lg font-semibold mb-4">Pattern Analysis</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Object.entries(mappingResult.patterns).map(([pattern, subs]) => (
                      subs.length > 0 && (
                        <div key={pattern} className="bg-gray-700 p-3 rounded">
                          <h4 className="font-semibold text-cyan-400 mb-2 capitalize">{pattern} Pattern</h4>
                          <div className="space-y-1">
                            {subs.slice(0, 5).map((sub, index) => (
                              <div key={index} className="text-sm text-gray-300">
                                {sub}
                              </div>
                            ))}
                            {subs.length > 5 && (
                              <div className="text-xs text-gray-500">
                                ... and {subs.length - 5} more
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    ))}
                  </div>
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-3 bg-gray-700 rounded">
                      <h4 className="font-semibold text-green-400 mb-2">Analysis Summary</h4>
                      <p className="text-sm text-gray-300">
                        Total subdomains: {mappingResult.total_subdomains} |
                        Unique patterns detected: {mappingResult.unique_patterns}
                      </p>
                    </div>
                    <div className="p-3 bg-gray-700 rounded">
                      <h4 className="font-semibold text-green-400 mb-2">ML Cluster Suggestions</h4>
                      {Object.keys(mappingResult.clusters || {}).length === 0 ? (
                        <p className="text-sm text-gray-300">No cluster suggestions available</p>
                      ) : (
                        <div className="space-y-2">
                          {Object.entries(mappingResult.clusters).map(([cid, items]) => (
                            <div key={cid} className="text-sm text-gray-300">
                              <div className="text-cyan-300 font-medium">Cluster {cid} ({items.length})</div>
                              <div className="ml-2">
                                {items.slice(0,4).map((s, i) => (
                                  <div key={i} className="text-xs">{s}</div>
                                ))}
                                {items.length > 4 && <div className="text-xs text-gray-500">... and {items.length - 4} more</div>}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {viewMode === 'graph' && mappingResult && (
                <GraphViewer
                  domain={domain}
                  subdomains={results.subdomains}
                  clusters={mappingResult.clusters}
                  onSave={async (mapping) => {
                    try {
                      await axios.post('http://localhost:8000/save-mapping', {
                        domain,
                        mapping
                      });
                      alert('Mapping saved successfully!');
                    } catch (err) {
                      alert('Failed to save mapping');
                      console.error(err);
                    }
                  }}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;



