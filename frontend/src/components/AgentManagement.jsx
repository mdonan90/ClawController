import { useEffect } from 'react'
import { Download, Sparkles } from 'lucide-react'
import { useMissionStore } from '../store/useMissionStore'
import AgentEditModal from './AgentEditModal'
import AddAgentWizard from './AddAgentWizard'
import ImportAgentsDialog from './ImportAgentsDialog'

// Status indicator colors
const statusConfig = {
  WORKING: { color: '#22C55E', label: 'Working', dotClass: 'status-dot--green status-dot--pulse' },
  IDLE: { color: '#F59E0B', label: 'Idle', dotClass: 'status-dot--yellow' },
  STANDBY: { color: '#9CA3AF', label: 'Standby', dotClass: 'status-dot--gray' },
  OFFLINE: { color: '#EF4444', label: 'Offline', dotClass: 'status-dot--red' },
}

// Model badge display
const getModelBadge = (modelId) => {
  if (!modelId) return { alias: '?', color: '#6B7280' }
  if (modelId.includes('opus')) return { alias: 'opus', color: '#9333EA' }
  if (modelId.includes('sonnet')) return { alias: 'sonnet', color: '#2563EB' }
  if (modelId.includes('haiku')) return { alias: 'haiku', color: '#0891B2' }
  if (modelId.includes('codex') || modelId.includes('gpt')) return { alias: 'codex', color: '#16A34A' }
  return { alias: modelId.split('/').pop()?.slice(0, 8) || '?', color: '#6B7280' }
}

function AgentCard({ agent, onClick }) {
  const status = statusConfig[agent.status] || statusConfig.OFFLINE
  const currentModel = agent.current_model || agent.model?.primary || agent.model
  const modelBadge = getModelBadge(currentModel)
  const isUsingFallback = (agent.current_model && 
                           agent.current_model === agent.fallback_model && 
                           agent.current_model !== agent.primary_model)
  
  return (
    <button className="agent-mgmt-card" onClick={() => onClick(agent.id)}>
      <div className="agent-mgmt-card-header">
        <div className="agent-mgmt-avatar" style={{ background: agent.color || 'var(--accent)' }}>
          {agent.avatar || agent.emoji || '🤖'}
        </div>
        <div className="agent-mgmt-status">
          <span className={`status-dot ${status.dotClass}`} />
          {isUsingFallback && (
            <span className="fallback-indicator" title="Using fallback model">⚠️</span>
          )}
        </div>
      </div>
      <div className="agent-mgmt-info">
        <h4>{agent.name}</h4>
        <span className="agent-mgmt-id">@{agent.id}</span>
      </div>
      {modelBadge.alias !== '?' && (
        <div className="agent-mgmt-footer">
          <span 
            className={`agent-mgmt-model-badge ${isUsingFallback ? 'fallback' : ''}`}
            style={{ background: `${modelBadge.color}20`, color: modelBadge.color }}
            title={isUsingFallback ? `Fallback: ${currentModel}` : `Primary: ${currentModel}`}
          >
            {isUsingFallback ? '⚠️ ' : ''}{modelBadge.alias}
          </span>
        </div>
      )}
    </button>
  )
}

function AddAgentCard({ onClick }) {
  return (
    <button className="agent-mgmt-card agent-mgmt-card--add" onClick={onClick}>
      <div className="agent-mgmt-add-icon">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </div>
      <span>Add Agent</span>
    </button>
  )
}

function EmptyState({ onInitialize, onImport }) {
  return (
    <div className="agent-mgmt-empty">
      <div className="agent-mgmt-empty-icon">🦞</div>
      <h3>Welcome to ClawController</h3>
      <p>Get started by creating your orchestrator agent. This will be your main agent that coordinates tasks and manages your team.</p>
      
      <button className="agent-mgmt-init-button" onClick={onInitialize}>
        <Sparkles size={20} />
        Initialize Orchestrator Agent
      </button>
      
      <div className="agent-mgmt-empty-divider">
        <span>or</span>
      </div>
      
      <button className="agent-mgmt-import-button" onClick={onImport}>
        <Download size={16} />
        Import from OpenClaw
      </button>
    </div>
  )
}

export default function AgentManagement() {
  const isOpen = useMissionStore((s) => s.isAgentManagementOpen)
  const agents = useMissionStore((s) => s.agents)
  const editingAgentId = useMissionStore((s) => s.editingAgentId)
  const isAddWizardOpen = useMissionStore((s) => s.isAddAgentWizardOpen)
  const wizardMode = useMissionStore((s) => s.addAgentWizardMode)
  const closeAgentManagement = useMissionStore((s) => s.closeAgentManagement)
  const setEditingAgent = useMissionStore((s) => s.setEditingAgent)
  const openAddAgentWizard = useMissionStore((s) => s.openAddAgentWizard)
  const openOrchestratorWizard = useMissionStore((s) => s.openOrchestratorWizard)
  const fetchModels = useMissionStore((s) => s.fetchModels)
  const openImportDialog = useMissionStore((s) => s.openImportDialog)
  
  // Fetch models when panel opens
  useEffect(() => {
    if (isOpen) {
      fetchModels()
    }
  }, [isOpen, fetchModels])
  
  if (!isOpen) return null
  
  const handleCardClick = (agentId) => {
    setEditingAgent(agentId)
  }
  
  const hasAgents = agents.length > 0
  
  return (
    <>
      <div className="agent-mgmt-overlay" onClick={closeAgentManagement} />
      <div className="agent-mgmt-panel">
        <div className="agent-mgmt-header">
          <div className="agent-mgmt-header-left">
            <h2>🤖 Agent Management</h2>
            {hasAgents && <span className="agent-mgmt-count">{agents.length} agents</span>}
          </div>
          {hasAgents && (
            <div className="agent-mgmt-header-right">
              <button className="import-agents-button" onClick={openImportDialog}>
                <Download size={16} />
                Import from OpenClaw
              </button>
            </div>
          )}
          <button className="agent-mgmt-close" onClick={closeAgentManagement}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {hasAgents ? (
          <div className="agent-mgmt-grid">
            {agents.map((agent) => (
              <AgentCard 
                key={agent.id} 
                agent={agent} 
                onClick={handleCardClick}
              />
            ))}
            <AddAgentCard onClick={openAddAgentWizard} />
          </div>
        ) : (
          <EmptyState 
            onInitialize={openOrchestratorWizard}
            onImport={openImportDialog}
          />
        )}
      </div>
      
      {/* Agent Edit Modal */}
      {editingAgentId && <AgentEditModal agentId={editingAgentId} />}
      
      {/* Add Agent Wizard */}
      {isAddWizardOpen && <AddAgentWizard mode={wizardMode} />}
      
      {/* Import Agents Dialog */}
      <ImportAgentsDialog />
    </>
  )
}
