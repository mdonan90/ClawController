import { useState, useEffect } from 'react'
import { useMissionStore } from '../store/useMissionStore'

const TABS = [
  { id: 'general', label: 'General' },
  { id: 'models', label: 'Models' },
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
  const [fallbackModel, setFallbackModel] = useState('')
  const [modelStatus, setModelStatus] = useState(null)
  const [files, setFiles] = useState({ soul: '', tools: '', agentsMd: '' })
  const [loadingFiles, setLoadingFiles] = useState(false)
  const [loadingModels, setLoadingModels] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  
  // Initialize form with agent data
  useEffect(() => {
    if (agent) {
      setName(agent.name || '')
      setEmoji(agent.avatar || agent.emoji || '🤖')
      setModel(agent.model?.primary || agent.model || '')
      setFallbackModel(agent.fallback_model || '')
    }
  }, [agent])
  
  // Load model status when switching to models tab
  useEffect(() => {
    if (activeTab === 'models' && agentId) {
      setLoadingModels(true)
      fetch(`/api/agents/${agentId}/model-status`)
        .then(res => res.json())
        .then(data => {
          setModelStatus(data)
          setLoadingModels(false)
        })
        .catch(err => {
          console.error('Failed to load model status:', err)
          setLoadingModels(false)
        })
    }
  }, [activeTab, agentId])
  
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
      } else if (activeTab === 'models') {
        await updateAgentModels(agentId, { model, fallbackModel })
      } else {
        await updateAgentFiles(agentId, files)
      }
      setHasChanges(false)
    } catch (err) {
      console.error('Save failed:', err)
    }
  }
  
  const updateAgentModels = async (agentId, { model, fallbackModel }) => {
    const response = await fetch(`/api/agents/${agentId}/models`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        primary_model: model, 
        fallback_model: fallbackModel 
      })
    })
    if (!response.ok) throw new Error('Failed to update models')
    return response.json()
  }
  
  const restorePrimaryModel = async () => {
    try {
      setLoadingModels(true)
      const response = await fetch(`/api/agents/${agentId}/restore-primary-model`, {
        method: 'POST'
      })
      if (!response.ok) throw new Error('Failed to restore primary model')
      
      // Reload model status
      const statusRes = await fetch(`/api/agents/${agentId}/model-status`)
      const statusData = await statusRes.json()
      setModelStatus(statusData)
    } catch (err) {
      console.error('Failed to restore primary model:', err)
    } finally {
      setLoadingModels(false)
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
          ) : activeTab === 'models' ? (
            <>
              {loadingModels ? (
                <div className="agent-edit-loading">
                  <div className="loading-spinner" />
                  <span>Loading model status...</span>
                </div>
              ) : (
                <>
                  {/* Current Model Status */}
                  {modelStatus && (
                    <div className="model-status-section">
                      <h4>Current Status</h4>
                      <div className={`model-status-card ${modelStatus.is_using_fallback ? 'fallback' : 'primary'}`}>
                        <div className="status-header">
                          <span className={`status-indicator ${modelStatus.is_using_fallback ? 'warning' : 'success'}`}>
                            {modelStatus.is_using_fallback ? '⚠️' : '✅'}
                          </span>
                          <span className="current-model">
                            {modelStatus.is_using_fallback ? 'Using Fallback' : 'Using Primary'}: {modelStatus.current_model}
                          </span>
                        </div>
                        {modelStatus.model_failure_count > 0 && (
                          <div className="failure-info">
                            <span className="failure-count">
                              {modelStatus.model_failure_count} failure(s) detected
                            </span>
                            {modelStatus.is_using_fallback && (
                              <button
                                className="restore-button"
                                onClick={restorePrimaryModel}
                                disabled={loadingModels}
                              >
                                Restore Primary Model
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Model Configuration */}
                  <div className="field">
                    <label>Primary Model</label>
                    <select
                      value={model}
                      onChange={handleFieldChange(setModel)}
                      className="agent-edit-select"
                    >
                      <option value="">Select primary model...</option>
                      {availableModels.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.alias} - {m.description}
                        </option>
                      ))}
                    </select>
                    <small className="field-hint">
                      The primary model used for normal operation
                    </small>
                  </div>
                  
                  <div className="field">
                    <label>Fallback Model</label>
                    <select
                      value={fallbackModel}
                      onChange={handleFieldChange(setFallbackModel)}
                      className="agent-edit-select"
                    >
                      <option value="">No fallback model</option>
                      {availableModels.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.alias} - {m.description}
                        </option>
                      ))}
                    </select>
                    <small className="field-hint">
                      Automatically used when the primary model fails
                    </small>
                  </div>

                  <div className="model-info">
                    <h5>Model Fallback Behavior</h5>
                    <ul>
                      <li>When the primary model fails, the agent automatically switches to the fallback</li>
                      <li>The agent stays on fallback until manually restored</li>
                      <li>You'll be notified when fallback activation occurs</li>
                      <li>Failure counts are tracked and reset when models are changed</li>
                    </ul>
                  </div>
                </>
              )}
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
