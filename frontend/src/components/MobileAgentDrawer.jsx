import { Users, Bot, Plus, X } from 'lucide-react'
import { useMissionStore } from '../store/useMissionStore'

const roleClasses = {
  LEAD: 'badge badge-lead',
  INT: 'badge badge-int',
  SPC: 'badge badge-spc'
}

const statusConfig = {
  WORKING: { dot: 'status-dot--green', label: 'Working', pulse: true },
  IDLE: { dot: 'status-dot--yellow', label: 'Idle', pulse: false },
  STANDBY: { dot: 'status-dot--blue', label: 'Standby', pulse: false },
  OFFLINE: { dot: 'status-dot--gray', label: 'Offline', pulse: false },
  ERROR: { dot: 'status-dot--red', label: 'Error', pulse: true }
}

export default function MobileAgentDrawer({ isOpen, onClose }) {
  const agents = useMissionStore((state) => state.agents)
  const selectedAgentId = useMissionStore((state) => state.selectedAgentId)
  const toggleAgentFilter = useMissionStore((state) => state.toggleAgentFilter)
  const openAgentManagement = useMissionStore((state) => state.openAgentManagement)
  const activeAgents = agents.filter((agent) => agent.status === 'WORKING').length

  if (!isOpen) return null

  const handleAgentClick = (agentId) => {
    toggleAgentFilter(agentId)
    onClose()
  }

  return (
    <>
      <div className="mobile-drawer-overlay" onClick={onClose} />
      <div className="mobile-agent-drawer">
        <div className="mobile-drawer-header">
          <div className="mobile-drawer-title">
            <Users size={20} />
            <span>Agents</span>
          </div>
          <button className="mobile-drawer-close" onClick={onClose}>
            <X size={24} />
          </button>
        </div>

        {agents.length === 0 ? (
          <div className="mobile-drawer-content">
            <div className="mobile-empty-state">
              <div className="mobile-empty-icon">
                <Bot size={48} />
              </div>
              <h3>No Agents Yet</h3>
              <p>Create your first agent to start automating tasks.</p>
              <button 
                className="mobile-create-button"
                onClick={() => {
                  openAgentManagement()
                  onClose()
                }}
              >
                <Plus size={18} />
                Create Agent
              </button>
            </div>
          </div>
        ) : (
          <div className="mobile-drawer-content">
            <div className="mobile-agent-summary">
              <div className="mobile-summary-item">
                <span className="mobile-summary-value">{agents.length}</span>
                <span className="mobile-summary-label">Total</span>
              </div>
              <div className="mobile-summary-divider" />
              <div className="mobile-summary-item">
                <span className="mobile-summary-value mobile-summary-active">{activeAgents}</span>
                <span className="mobile-summary-label">Active</span>
              </div>
            </div>

            <div className="mobile-agent-list">
              <div 
                className={`mobile-agent-item mobile-agent-all ${!selectedAgentId ? 'selected' : ''}`}
                onClick={() => handleAgentClick(null)}
              >
                <div className="mobile-agent-avatar mobile-agent-avatar-all">
                  <Users size={20} />
                </div>
                <div className="mobile-agent-info">
                  <div className="mobile-agent-name">All Agents</div>
                  <div className="mobile-agent-subtitle">
                    {selectedAgentId ? 'Tap to clear filter' : 'Showing all tasks'}
                  </div>
                </div>
                {selectedAgentId && <div className="mobile-agent-clear">Clear</div>}
              </div>

              {agents.map((agent) => {
                const status = statusConfig[agent.status] || statusConfig.OFFLINE
                const isSelected = selectedAgentId === agent.id
                
                return (
                  <div
                    key={agent.id}
                    className={`mobile-agent-item ${isSelected ? 'selected' : ''}`}
                    onClick={() => handleAgentClick(agent.id)}
                  >
                    <div 
                      className="mobile-agent-avatar"
                      style={{ backgroundColor: agent.color }}
                    >
                      {agent.avatar}
                    </div>
                    <div className="mobile-agent-info">
                      <div className="mobile-agent-name">
                        {agent.name}
                        <span className={roleClasses[agent.role]}>{agent.role}</span>
                      </div>
                      <div className="mobile-agent-status">
                        <span className={`mobile-status-dot ${status.dot} ${status.pulse ? 'pulse' : ''}`} />
                        <span>{status.label}</span>
                      </div>
                    </div>
                    {isSelected && <div className="mobile-agent-check">✓</div>}
                  </div>
                )
              })}
            </div>

            <button 
              className="mobile-manage-agents-button"
              onClick={() => {
                openAgentManagement()
                onClose()
              }}
            >
              <Plus size={18} />
              Manage Agents
            </button>
          </div>
        )}
      </div>
    </>
  )
}