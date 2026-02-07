import { useState, useEffect } from 'react'
import { useMissionStore } from '../store/useMissionStore'

const TABS = [
  { id: 'general', label: 'General' },
  { id: 'files', label: 'Files' },
]

export default function AgentEditModal({ agentId }) {
  const agents = useMissionStore((s) => s.agents)
  const availableModels = useMissionStore((s) => s.availableModels)
  const loading = useMissionStore((s) => s.loadingAgentManagement)
  const closeEditingAgent = useMissionStore((s) => s.closeEditingAgent)
  const updateAgent = useMissionStore((s) => s.updateAgent)
  const updateAgentFiles = useMissionStore((s) => s.updateAgentFiles)
  const getAgentFiles = useMissionStore((s) => s.getAgentFiles)
  const deleteAgent = useMissionStore((s) => s.deleteAgent)
  
  const agent = agents.find((a) => a.id === agentId)
  
  const [activeTab, setActiveTab] = useState('general')
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('')
  const [model, setModel] = useState('')
  const [files, setFiles] = useState({ soul: '', tools: '', agentsMd: '' })
  const [loadingFiles, setLoadingFiles] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  
  // Initialize form with agent data
  useEffect(() => {
    if (agent) {
      setName(agent.name || '')
      setEmoji(agent.avatar || agent.emoji || '🤖')
      setModel(agent.model?.primary || agent.model || '')
    }
  }, [agent])
  
  // Load files when switching to files tab
  useEffect(() => {
    if (activeTab === 'files' && agentId) {
      setLoadingFiles(true)
      getAgentFiles(agentId)
        .then((data) => {
          setFiles({
            soul: data.soul || '',
            tools: data.tools || '',
            agentsMd: data.agentsMd || '',
          })
        })
        .catch((err) => {
          console.error('Failed to load files:', err)
        })
        .finally(() => {
          setLoadingFiles(false)
        })
    }
  }, [activeTab, agentId, getAgentFiles])
  
  if (!agent) return null
  
  const handleSave = async () => {
    try {
      if (activeTab === 'general') {
        await updateAgent(agentId, { name, emoji, model })
      } else {
        await updateAgentFiles(agentId, files)
      }
      setHasChanges(false)
    } catch (err) {
      console.error('Save failed:', err)
    }
  }
  
  const handleDelete = async () => {
    try {
      await deleteAgent(agentId)
    } catch (err) {
      console.error('Delete failed:', err)
    }
  }
  
  const handleFieldChange = (setter) => (e) => {
    setter(e.target.value)
    setHasChanges(true)
  }
  
  const handleFileChange = (field) => (e) => {
    setFiles((prev) => ({ ...prev, [field]: e.target.value }))
    setHasChanges(true)
  }
  
  console.log('🟡 AgentEditModal rendering for agent:', agentId)
  
  return (
    <div className="modal-overlay agent-edit-overlay" onClick={closeEditingAgent}>
      <div className="modal agent-edit-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <span className="modal-label">Edit Agent</span>
            <h2>
              <span style={{ marginRight: '8px' }}>{emoji}</span>
              {name || agent.name}
            </h2>
            <div className="modal-badges">
              <span className="agent-badge">@{agentId}</span>
            </div>
          </div>
          <button className="icon-button" onClick={closeEditingAgent}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {/* Tabs */}
        <div className="agent-edit-tabs">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`agent-edit-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        
        <div className="modal-content">
          {activeTab === 'general' ? (
            <>
              <div className="field">
                <label>Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={handleFieldChange(setName)}
                  placeholder="Agent name"
                />
              </div>
              
              <div className="field">
                <label>Emoji</label>
                <input
                  type="text"
                  value={emoji}
                  onChange={handleFieldChange(setEmoji)}
                  placeholder="🤖"
                  style={{ width: '80px' }}
                />
              </div>
              
              <div className="field">
                <label>Model</label>
                <select
                  value={model}
                  onChange={handleFieldChange(setModel)}
                  className="agent-edit-select"
                >
                  <option value="">Select a model...</option>
                  {availableModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.alias} - {m.description}
                    </option>
                  ))}
                </select>
              </div>
            </>
          ) : (
            <>
              {loadingFiles ? (
                <div className="agent-edit-loading">
                  <div className="loading-spinner" />
                  <span>Loading files...</span>
                </div>
              ) : (
                <>
                  <div className="field">
                    <label>SOUL.md</label>
                    <textarea
                      value={files.soul}
                      onChange={handleFileChange('soul')}
                      placeholder="Agent personality and behavior..."
                      rows={8}
                      className="agent-edit-textarea"
                    />
                  </div>
                  
                  <div className="field">
                    <label>TOOLS.md</label>
                    <textarea
                      value={files.tools}
                      onChange={handleFileChange('tools')}
                      placeholder="Tool configurations and preferences..."
                      rows={6}
                      className="agent-edit-textarea"
                    />
                  </div>
                  
                  <div className="field">
                    <label>AGENTS.md</label>
                    <textarea
                      value={files.agentsMd}
                      onChange={handleFileChange('agentsMd')}
                      placeholder="Workspace configuration..."
                      rows={4}
                      className="agent-edit-textarea"
                    />
                  </div>
                </>
              )}
            </>
          )}
        </div>
        
        <div className="modal-actions">
          {showDeleteConfirm ? (
            <>
              <span className="delete-confirm-text">Delete this agent?</span>
              <button
                className="secondary-button"
                onClick={() => setShowDeleteConfirm(false)}
              >
                Cancel
              </button>
              <button
                className="danger-button"
                onClick={handleDelete}
                disabled={loading}
              >
                {loading ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </>
          ) : (
            <>
              <button
                className="danger-button-outline"
                onClick={() => setShowDeleteConfirm(true)}
              >
                Delete
              </button>
              <div style={{ flex: 1 }} />
              <button className="secondary-button" onClick={closeEditingAgent}>
                Cancel
              </button>
              <button
                className="primary-button"
                onClick={handleSave}
                disabled={loading || !hasChanges}
              >
                {loading ? 'Saving...' : 'Save Changes'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
