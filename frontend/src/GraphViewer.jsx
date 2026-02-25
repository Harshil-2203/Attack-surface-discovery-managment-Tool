import { useEffect, useRef, useState } from 'react';
import Cytoscape from 'cytoscape';
import COSEBilkent from 'cytoscape-cose-bilkent';

Cytoscape.use(COSEBilkent);

export default function GraphViewer({ domain, subdomains, clusters, onSave }) {
  const containerRef = useRef(null);
  const cyRef = useRef(null);
  const initializedClustersRef = useRef(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [newGroupName, setNewGroupName] = useState('');
  const [isInitialized, setIsInitialized] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editedLabel, setEditedLabel] = useState('');

  if (!clusters || Object.keys(clusters).length === 0) {
    return (
      <div className="flex flex-col gap-4 bg-gray-900 p-4 rounded border border-gray-700">
        <div className="h-96 bg-black rounded border border-gray-700 flex items-center justify-center">
          <p className="text-gray-400">No cluster data available. Please run ML mapping first.</p>
        </div>
      </div>
    );
  }

useEffect(() => {
  if (!containerRef.current || !clusters) return;

  // Destroy safely if exists
  if (cyRef.current) {
    cyRef.current.destroy();
    cyRef.current = null;
  }

  const nodes = [];
  const edges = [];

  // Root
  nodes.push({
    data: { id: domain, label: domain, type: 'root' }
  });

  Object.entries(clusters).forEach(([groupId, subs]) => {
    const groupNode = `group_${groupId}`;

    nodes.push({
      data: { id: groupNode, label: `Cluster ${groupId}`, type: 'group' }
    });

    edges.push({
      data: { source: domain, target: groupNode }
    });

    subs.forEach((sub) => {
      nodes.push({
        data: { id: sub, label: sub, type: 'subdomain', group: groupId }
      });

      edges.push({
        data: { source: groupNode, target: sub }
      });
    });
  });

  const cy = Cytoscape({
    container: containerRef.current,
    elements: [...nodes, ...edges],
    style: [
      {
        selector: 'node',
        style: {
          label: 'data(label)',
          'text-valign': 'center',
          'text-halign': 'center',
          'background-color': '#8b5cf6',
          color: '#fff'
        }
      },
      {
        selector: 'node[type="root"]',
        style: { 'background-color': '#10b981' }
      },
      {
        selector: 'node[type="group"]',
        style: { 'background-color': '#3b82f6' }
      },
      {
        selector: 'edge',
        style: {
          'line-color': '#666',
          width: 2
        }
      }
    ],
    layout: {
      name: 'cose-bilkent',
      animate: false,
      fit: true,
      padding: 30
    }
  });

  cyRef.current = cy;

  cy.on('tap', (event) => {
    const node = event.target;
    if (node.isNode()) {
      setSelectedNode(node.data());
    } else {
      setSelectedNode(null);
    }
  });

  return () => {
    if (cyRef.current) {
      cyRef.current.destroy();
      cyRef.current = null;
    }
  };

}, [clusters, domain]);     
  const handleMoveToGroup = (newGroup) => {
    if (!selectedNode || !newGroup) return;
    if (cyRef.current) {
      const node = cyRef.current.$(`#${selectedNode.id}`);
      node.data('group', newGroup);
      setSelectedNode({ ...selectedNode, group: newGroup });
    }
  };

  const handleDeleteNode = () => {
    if (!selectedNode || selectedNode.type === 'root') return;
    if (cyRef.current) {
      const node = cyRef.current.$(`#${selectedNode.id}`);
      cyRef.current.remove(node);
      setSelectedNode(null);
    }
  };

  const handleEditLabel = () => {
    if (!selectedNode) return;
    setEditedLabel(selectedNode.label || selectedNode.id);
    setEditMode(true);
  };

  const handleSaveLabel = () => {
    if (!selectedNode || !editedLabel.trim()) return;
    if (cyRef.current) {
      const node = cyRef.current.$(`#${selectedNode.id}`);
      node.data('label', editedLabel.trim());
      setSelectedNode({ ...selectedNode, label: editedLabel.trim() });
      setEditMode(false);
      setEditedLabel('');
    }
  };

  const handleCancelEdit = () => {
    setEditMode(false);
    setEditedLabel('');
  };

  const handleSave = async () => {
    if (!cyRef.current) return;
    const mapping = {};
    cyRef.current.nodes().forEach((node) => {
      const data = node.data();
      if (data.type === 'subdomain') {
        mapping[data.id] = data.group || 'ungrouped';
      }
    });
    await onSave(mapping);
  };

  const availableGroups = clusters ? Object.keys(clusters) : [];

  return (
    <div className="flex flex-col gap-4 bg-gray-900 p-4 rounded border border-gray-700">
      <div 
        className="bg-black rounded border border-gray-700" 
        ref={containerRef}
        style={{ 
          position: 'relative',
          width: '100%',
          height: '384px',
          backgroundColor: '#000000 !important'
        }}
      >
        {!isInitialized && (
          <div className="absolute inset-0 flex items-center justify-center bg-black">
            <p className="text-gray-400">Loading graph...</p>
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gray-800 p-3 rounded">
          <h4 className="font-semibold text-cyan-400 mb-2">Selected Node</h4>
          {selectedNode ? (
            <div className="text-sm text-gray-300 space-y-2">
              {editMode ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={editedLabel}
                    onChange={(e) => setEditedLabel(e.target.value)}
                    className="w-full px-2 py-1 text-sm bg-gray-700 border border-gray-600 rounded text-gray-300"
                    placeholder="Enter new label"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveLabel}
                      className="px-2 py-1 bg-green-600 hover:bg-green-700 rounded text-xs font-semibold text-white"
                    >
                      Save
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      className="px-2 py-1 bg-gray-600 hover:bg-gray-700 rounded text-xs font-semibold text-white"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-yellow-400 font-mono">{selectedNode.id}</p>
                  <p className="text-gray-400">Type: {selectedNode.type}</p>
                  {selectedNode.type === 'subdomain' && (
                    <div className="mt-2 space-y-2">
                      <div>
                        <label className="text-gray-300 text-xs">Move to Group:</label>
                        <select
                          value={selectedNode.group || ''}
                          onChange={(e) => handleMoveToGroup(e.target.value)}
                          className="w-full px-2 py-1 text-sm bg-gray-700 border border-gray-600 rounded text-gray-300 mt-1"
                        >
                          <option value="">-- Select Group --</option>
                          {availableGroups.map((g) => (
                            <option key={g} value={g}>
                              Cluster {g}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={handleEditLabel}
                          className="px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs font-semibold text-white"
                        >
                          Edit Label
                        </button>
                        <button
                          onClick={handleDeleteNode}
                          className="px-2 py-1 bg-red-600 hover:bg-red-700 rounded text-xs font-semibold text-white"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">Click a node to select</p>
          )}
        </div>

        <div className="bg-gray-800 p-3 rounded">
          <h4 className="font-semibold text-green-400 mb-2">Actions</h4>
          <button
            onClick={handleSave}
            className="w-full px-3 py-2 bg-green-600 hover:bg-green-700 rounded text-sm font-semibold text-white"
          >
            Save Mapping
          </button>
          <p className="text-xs text-gray-500 mt-2">
            Click nodes to select, use dropdown to re-group. Click Save Mapping to persist.
          </p>
        </div>
      </div>

      <div className="text-xs text-gray-500">
        <p>Right-click and drag to pan • Scroll to zoom • Click nodes to select and edit</p>
        <p>ML generates initial clusters • Manually move, edit labels, or delete nodes • Save changes</p>
      </div>
    </div>
  );
}
