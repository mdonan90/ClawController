import { Activity, MessageSquare, Zap, Megaphone, ChevronDown } from 'lucide-react'
import { useState, useMemo } from 'react'
import { useMissionStore } from '../store/useMissionStore'
import MentionText from './MentionText'

const filterOptions = ['All', 'Tasks', 'Comments', 'Status']
const PAGE_SIZE = 20

// Activity types to suppress from the feed (noise reduction)
const SUPPRESSED_TYPES = new Set(['watchdog_started', 'watchdog_stopped'])

const iconMap = {
  task: <Activity size={16} />,
  comment: <MessageSquare size={16} />,
  status: <Zap size={16} />,
  announcement: <Megaphone size={16} />
}

/** Collapse consecutive identical entries into one with a repeat count. */
function collapseConsecutiveDuplicates(items) {
  if (!items.length) return []
  const result = []
  let current = { ...items[0], repeatCount: 1 }

  for (let i = 1; i < items.length; i++) {
    const item = items[i]
    if (item.title === current.title && item.detail === current.detail) {
      current.repeatCount += 1
    } else {
      result.push(current)
      current = { ...item, repeatCount: 1 }
    }
  }
  result.push(current)
  return result
}

export default function LiveFeed() {
  const [filter, setFilter] = useState('All')
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const feed = useMissionStore((state) => state.liveFeed)
  const agents = useMissionStore((state) => state.agents)
  const selectTask = useMissionStore((state) => state.selectTask)
  const isLoading = useMissionStore((state) => state.isLoading)

  // Filter by tab selection + suppress noisy system types
  const filteredFeed = useMemo(() => {
    return feed.filter((item) => {
      // Suppress known noise types
      if (SUPPRESSED_TYPES.has(item.activityType || item.type)) return false
      if (filter === 'All') return true
      if (filter === 'Tasks') return item.type === 'task'
      if (filter === 'Comments') return item.type === 'comment'
      if (filter === 'Status') return item.type === 'status'
      return true
    })
  }, [feed, filter])

  // Collapse consecutive duplicates
  const collapsedFeed = useMemo(() => collapseConsecutiveDuplicates(filteredFeed), [filteredFeed])

  // Paginate
  const visibleItems = collapsedFeed.slice(0, visibleCount)
  const hasMore = visibleCount < collapsedFeed.length

  // Reset pagination when filter changes
  const handleFilterChange = (option) => {
    setFilter(option)
    setVisibleCount(PAGE_SIZE)
  }

  // Get agent with fallback
  const getAgent = (item) => {
    if (item.agent) return item.agent
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
          {!isCollapsed && (
            <span className="panel-subtitle">
              {collapsedFeed.length > 0
                ? `Showing ${Math.min(visibleCount, collapsedFeed.length)} of ${collapsedFeed.length}`
                : 'Recent activity across the squad'}
            </span>
          )}
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
                onClick={() => handleFilterChange(option)}
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
            ) : visibleItems.length === 0 ? (
              <div className="feed-empty">
                <Activity size={24} style={{ opacity: 0.3 }} />
                <p>No activity yet</p>
              </div>
            ) : (
              <>
                {visibleItems.map((item) => {
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
                        <div className="feed-title">
                          {item.title}
                          {item.repeatCount > 1 && (
                            <span className="feed-repeat-badge"> ×{item.repeatCount}</span>
                          )}
                        </div>
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
                })}

                {hasMore && (
                  <button
                    type="button"
                    className="feed-load-more"
                    onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                  >
                    <ChevronDown size={14} />
                    Load more ({collapsedFeed.length - visibleCount} remaining)
                  </button>
                )}
              </>
            )}
          </div>
        </>
      )}
    </section>
  )
}
