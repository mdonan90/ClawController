import { Users, Bot, Plus, Settings, LogOut } from 'lucide-react'
import { useMissionStore } from '../store/useMissionStore'
import { useNavigate } from 'react-router-dom'
import { clearStoredApiKey } from '../api'

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

export default function AgentSidebar() {
  const navigate = useNavigate()
  const agents = useMissionStore((state) => state.agents)
  const selectedAgentId = useMissionStore((state) => state.selectedAgentId)
  const toggleAgentFilter = useMissionStore((state) => state.toggleAgentFilter)
  const openAgentManagement = useMissionStore((state) => state.openAgentManagement)
  const activeAgents = agents.filter((agent) => agent.status === 'WORKING').length

  const handleChangeApiKey = () => {
    if (confirm('Change API Key? You will be logged out and asked to enter a new key.')) {
      clearStoredApiKey()
      navigate('/login')
      window.location.reload()
    }
  }

  // Show empty state when no agents exist
  if (agents.length === 0) {
    return (
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-title">
            <Users size={16} />
            AGENTS
          </div>
          <span className="count-badge">0</span>
        </div>

        <div className="empty-state">
          <div className="empty-state-icon">
            <Bot size={48} />
          </div>
          <h3 className="empty-state-title">Welcome to ClawController!</h3>
          <p className="empty-state-description">
            Your agent command center is ready. Create your first agent to start orchestrating tasks and automating your workflow.
          </p>
          <button 
            className="empty-state-button"
            onClick={openAgentManagement}
          >
            <Plus size={16} />
            Create Your First Agent
          </button>
          <div className="empty-state-tips">
            <h4>Quick Tips:</h4>
            <ul>
              <li>Agents can be developers, analysts, or specialists</li>
              <li>Use @mentions to assign tasks to specific agents</li>
              <li>Agents work together on your projects</li>
            </ul>
          </div>
        </div>

        <div className="sidebar-footer" style={{ marginTop: 'auto', paddingTop: '20px', borderTop: '1px solid var(--border)' }}>
          <button
            className="agent-card"
            onClick={handleChangeApiKey}
            style={{ gridTemplateColumns: '32px 1fr', alignItems: 'center', height: 'auto', padding: '10px 14px' }}
          >
            <div className="agent-avatar" style={{ width: '32px', height: '32px', background: 'var(--bg-secondary)', color: 'var(--muted)' }}>
              <Settings size={16} />
            </div>
            <div className="agent-info">
              <div className="agent-name" style={{ fontSize: '13px' }}>Manage API Key</div>
            </div>
          </button>
        </div>
      </aside>
    )
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-title">
          <Users size={16} />
          AGENTS
        </div>
        <span className="count-badge">{agents.length}</span>
      </div>

      <div className="sidebar-summary">
        <div>
          <div className="summary-title">All Agents</div>
          <div className="summary-subtitle">
            {selectedAgentId ? 'Click agent again to clear filter' : 'Click an agent to filter tasks'}
          </div>
        </div>
        <div className="summary-count">{activeAgents}</div>
      </div>

      <div className="agent-list">
        {agents.map((agent) => {
          const isSelected = selectedAgentId === agent.id
          return (
            <button
              key={agent.id}
              type="button"
              className={`agent-card ${isSelected ? 'agent-card--selected' : ''}`}
              onClick={() => toggleAgentFilter(agent.id)}
              style={isSelected ? { 
                borderColor: agent.color,
                boxShadow: `0 0 0 2px ${agent.color}25, 0 10px 20px rgba(224, 123, 60, 0.12)`
              } : undefined}
            >
              <div className="agent-avatar" style={{ backgroundColor: agent.color }}>
                <span>{agent.avatar}</span>
              </div>
              <div className="agent-info">
                <div className="agent-top">
                  <span className="agent-name">{agent.name}</span>
                  {agent.role === 'LEAD' && <span className={roleClasses[agent.role]}>Lead</span>}
                </div>
                <div className="agent-desc">{agent.description}</div>
              </div>
              <div className="agent-status" title={statusConfig[agent.status]?.label || agent.status}>
                <span className={`status-dot ${statusConfig[agent.status]?.dot || 'status-dot--gray'} ${statusConfig[agent.status]?.pulse ? 'status-dot--pulse' : ''}`} />
                <span className="status-label">{statusConfig[agent.status]?.label || agent.status}</span>
              </div>
            </button>
          )
        })}
      </div>

      <div className="sidebar-footer" style={{ marginTop: 'auto', paddingTop: '20px', borderTop: '1px solid var(--border)' }}>
        <button
          className="agent-card"
          onClick={handleChangeApiKey}
          style={{ gridTemplateColumns: '32px 1fr', alignItems: 'center', height: 'auto', padding: '10px 14px' }}
        >
          <div className="agent-avatar" style={{ width: '32px', height: '32px', background: 'var(--bg-secondary)', color: 'var(--muted)' }}>
            <Settings size={16} />
          </div>
          <div className="agent-info">
            <div className="agent-name" style={{ fontSize: '13px' }}>Manage API Key</div>
          </div>
        </button>
      </div>
    </aside>
  )
}
