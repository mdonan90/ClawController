import { useEffect } from 'react'
import { useMissionStore } from '../store/useMissionStore'
import AgentEditModal from './AgentEditModal'
import AddAgentWizard from './AddAgentWizard'

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
  const modelBadge = getModelBadge(agent.model?.primary || agent.model)
  
  return (
    <button className="agent-mgmt-card" onClick={() => onClick(agent.id)}>
      <div className="agent-mgmt-card-header">
        <div className="agent-mgmt-avatar" style={{ background: agent.color || 'var(--accent)' }}>
          {agent.avatar || agent.emoji || '🤖'}
        </div>
        <div className="agent-mgmt-status">
          <span className={`status-dot ${status.dotClass}`} />
        </div>
      </div>
      <div className="agent-mgmt-info">
        <h4>{agent.name}</h4>
        <span className="agent-mgmt-id">@{agent.id}</span>
      </div>
      {modelBadge.alias !== '?' && (
        <div className="agent-mgmt-footer">
          <span 
            className="agent-mgmt-model-badge"
            style={{ background: `${modelBadge.color}20`, color: modelBadge.color }}
          >
            {modelBadge.alias}
          </span>
        </div>
      )}
    </button>
  )
}

function AddAgentCard({ onClick }) {
  return (
    <button className="agent-mgmt-card agent-mgmt-card--add" onClick={() => { console.log('🟢 Add Agent clicked'); onClick(); }}>
      <div className="agent-mgmt-add-icon">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </div>
      <span>Add Agent</span>
    </button>
  )
}

export default function AgentManagement() {
  const isOpen = useMissionStore((s) => s.isAgentManagementOpen)
  const agents = useMissionStore((s) => s.agents)
  const editingAgentId = useMissionStore((s) => s.editingAgentId)
  const isAddWizardOpen = useMissionStore((s) => s.isAddAgentWizardOpen)
  const closeAgentManagement = useMissionStore((s) => s.closeAgentManagement)
  const setEditingAgent = useMissionStore((s) => s.setEditingAgent)
  const openAddAgentWizard = useMissionStore((s) => s.openAddAgentWizard)
  const fetchModels = useMissionStore((s) => s.fetchModels)
  
  // Fetch models when panel opens
  useEffect(() => {
    if (isOpen) {
      fetchModels()
    }
  }, [isOpen, fetchModels])
  
  if (!isOpen) return null
  
  const handleCardClick = (agentId) => {
    console.log('🔵 AgentManagement card clicked:', agentId)
    setEditingAgent(agentId)
  }
  
  return (
    <>
      <div className="agent-mgmt-overlay" onClick={() => { console.log('🔴 Overlay clicked - closing'); closeAgentManagement(); }} />
      <div className="agent-mgmt-panel">
        <div className="agent-mgmt-header">
          <div className="agent-mgmt-header-left">
            <h2>🤖 Agent Management</h2>
            <span className="agent-mgmt-count">{agents.length} agents</span>
          </div>
          <button className="agent-mgmt-close" onClick={closeAgentManagement}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        
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
      </div>
      
      {/* Agent Edit Modal */}
      {editingAgentId && <AgentEditModal agentId={editingAgentId} />}
      
      {/* Add Agent Wizard */}
      {isAddWizardOpen && <AddAgentWizard />}
    </>
  )
}
