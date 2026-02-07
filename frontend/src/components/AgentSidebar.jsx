import { Users } from 'lucide-react'
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

export default function AgentSidebar() {
  const agents = useMissionStore((state) => state.agents)
  const selectedAgentId = useMissionStore((state) => state.selectedAgentId)
  const toggleAgentFilter = useMissionStore((state) => state.toggleAgentFilter)
  const activeAgents = agents.filter((agent) => agent.status === 'WORKING').length

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
    </aside>
  )
}
