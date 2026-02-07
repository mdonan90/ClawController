import { Activity, MessageSquare, Zap, Megaphone } from 'lucide-react'
import { useState } from 'react'
import { useMissionStore } from '../store/useMissionStore'
import MentionText from './MentionText'

const filterOptions = ['All', 'Tasks', 'Comments', 'Status']

const iconMap = {
  task: <Activity size={16} />,
  comment: <MessageSquare size={16} />,
  status: <Zap size={16} />,
  announcement: <Megaphone size={16} />
}

export default function LiveFeed() {
  const [filter, setFilter] = useState('All')
  const [isCollapsed, setIsCollapsed] = useState(false)
  const feed = useMissionStore((state) => state.liveFeed)
  const agents = useMissionStore((state) => state.agents)
  const selectTask = useMissionStore((state) => state.selectTask)
  const isLoading = useMissionStore((state) => state.isLoading)

  const filteredFeed = feed.filter((item) => {
    if (filter === 'All') return true
    if (filter === 'Tasks') return item.type === 'task'
    if (filter === 'Comments') return item.type === 'comment'
    if (filter === 'Status') return item.type === 'status'
    return true
  })

  // Get agent with fallback
  const getAgent = (item) => {
    // Check if agent data is embedded
    if (item.agent) return item.agent
    // Look up by ID
    if (item.agentId) {
      const found = agents.find((a) => a.id === item.agentId)
      if (found) return found
    }
    return null
  }

  return (
    <section className={`live-feed ${isCollapsed ? 'live-feed--collapsed' : ''}`}>
      <div className="panel-header">
        <div>
          <h3>Live Feed</h3>
          {!isCollapsed && <span className="panel-subtitle">Recent activity across the squad</span>}
        </div>
        <button
          type="button"
          className="collapse-toggle"
          onClick={() => setIsCollapsed(!isCollapsed)}
          title={isCollapsed ? 'Expand' : 'Collapse'}
        >
          {isCollapsed ? '+' : '−'}
        </button>
      </div>

      {!isCollapsed && (
        <>
          <div className="feed-tabs">
            {filterOptions.map((option) => (
              <button
                key={option}
                type="button"
                className={`feed-tab ${filter === option ? 'active' : ''}`}
                onClick={() => setFilter(option)}
              >
                {option}
              </button>
            ))}
          </div>

          <div className="feed-list">
        {isLoading ? (
          <div className="feed-loading">
            <div className="loading-spinner" style={{ width: 24, height: 24, margin: '20px auto' }} />
          </div>
        ) : filteredFeed.length === 0 ? (
          <div className="feed-empty">
            <Activity size={24} style={{ opacity: 0.3 }} />
            <p>No activity yet</p>
          </div>
        ) : (
          filteredFeed.map((item) => {
            const agent = getAgent(item)
            return (
              <button
                key={item.id}
                type="button"
                className="feed-item feed-item--clickable"
                onClick={() => item.taskId && selectTask(item.taskId)}
              >
                <div className="feed-icon">{iconMap[item.type] || iconMap.task}</div>
                <div className="feed-content">
                  <div className="feed-title">{item.title}</div>
                  <div className="feed-detail">
                    <MentionText text={item.detail || ''} />
                  </div>
                  <div className="feed-meta">
                    {agent && (
                      <div className="feed-agent">
                        <span className="agent-dot" style={{ backgroundColor: agent.color || '#6B7280' }} />
                        {agent.name}
                      </div>
                    )}
                    <span>{item.timestamp}</span>
                  </div>
                </div>
              </button>
            )
          })
        )}
          </div>
        </>
      )}
    </section>
  )
}
