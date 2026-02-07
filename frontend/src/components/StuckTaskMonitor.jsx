import { useEffect, useState } from 'react'
import { api } from '../api'
import './StuckTaskMonitor.css'

export default function StuckTaskMonitor() {
  const [isOpen, setIsOpen] = useState(false)
  const [monitorStatus, setMonitorStatus] = useState(null)
  const [stuckTasks, setStuckTasks] = useState([])
  const [loading, setLoading] = useState(false)
  const [lastCheck, setLastCheck] = useState(null)
  const [offlineAgents, setOfflineAgents] = useState([])

  // Auto-refresh monitor status every 5 minutes
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const status = await api.get('/api/monitoring/stuck-tasks/status')
        setMonitorStatus(status)
      } catch (error) {
        console.error('Failed to fetch monitor status:', error)
      }
    }
    
    fetchStatus()
    const interval = setInterval(fetchStatus, 5 * 60 * 1000) // 5 minutes
    
    return () => clearInterval(interval)
  }, [])

  const runStuckTaskCheck = async () => {
    setLoading(true)
    try {
      const result = await api.get('/api/monitoring/stuck-tasks/check')
      setStuckTasks(result.stuck_tasks || [])
      setOfflineAgents(result.agents_offline || [])
      setLastCheck(new Date(result.run_timestamp))
      
      // Show notification if stuck tasks found
      if (result.stuck_tasks && result.stuck_tasks.length > 0) {
        setIsOpen(true)
      }
    } catch (error) {
      console.error('Failed to run stuck task check:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatTimeAgo = (timestamp) => {
    if (!timestamp) return 'Never'
    const ago = new Date() - new Date(timestamp)
    const hours = Math.floor(ago / (1000 * 60 * 60))
    const minutes = Math.floor((ago % (1000 * 60 * 60)) / (1000 * 60))
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ago`
    }
    return `${minutes}m ago`
  }

  const getSeverityIcon = (hours, priority) => {
    const isUrgent = priority === 'URGENT'
    
    if (hours > (isUrgent ? 24 : 48)) {
      return '🔴' // Critical
    } else if (hours > (isUrgent ? 12 : 24)) {
      return '🟡' // Warning
    } else {
      return '🟠' // Attention
    }
  }

  const hasIssues = stuckTasks.length > 0 || offlineAgents.length > 0

  return (
    <>
      {/* Monitor Status Widget */}
      <div className={`stuck-task-widget ${hasIssues ? 'has-issues' : ''}`}>
        <button 
          className="widget-toggle"
          onClick={() => setIsOpen(!isOpen)}
          title="Stuck Task Monitor"
        >
          <span className="monitor-icon">
            {hasIssues ? '⚠️' : '✅'}
          </span>
          <span className="monitor-label">Monitor</span>
          {hasIssues && (
            <span className="issue-badge">
              {stuckTasks.length + offlineAgents.length}
            </span>
          )}
        </button>
      </div>

      {/* Monitor Panel */}
      {isOpen && (
        <div className="stuck-task-modal">
          <div className="stuck-task-content">
            <div className="stuck-task-header">
              <h2>🔍 Task Monitor</h2>
              <button className="close-btn" onClick={() => setIsOpen(false)}>×</button>
            </div>

            <div className="monitor-controls">
              <button 
                className="check-btn"
                onClick={runStuckTaskCheck}
                disabled={loading}
              >
                {loading ? '⏳ Checking...' : '🔄 Run Check'}
              </button>
              {lastCheck && (
                <span className="last-check">
                  Last check: {formatTimeAgo(lastCheck)}
                </span>
              )}
            </div>

            {/* Monitor Status */}
            {monitorStatus && (
              <div className="monitor-stats">
                <div className="stat-item">
                  <span className="stat-label">Total Notifications:</span>
                  <span className="stat-value">{monitorStatus.total_notifications_sent}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Tracked Tasks:</span>
                  <span className="stat-value">{monitorStatus.currently_tracked_tasks}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Last Run:</span>
                  <span className="stat-value">{formatTimeAgo(monitorStatus.last_run)}</span>
                </div>
              </div>
            )}

            {/* Stuck Tasks */}
            {stuckTasks.length > 0 && (
              <div className="stuck-tasks-section">
                <h3>🚨 Stuck Tasks ({stuckTasks.length})</h3>
                <div className="stuck-tasks-list">
                  {stuckTasks.map((task) => (
                    <div key={task.task_id} className="stuck-task-item">
                      <div className="task-header">
                        <span className="severity-icon">
                          {getSeverityIcon(task.time_stuck_hours, task.priority)}
                        </span>
                        <span className="task-title">{task.title}</span>
                        <span className={`task-priority ${task.priority.toLowerCase()}`}>
                          {task.priority}
                        </span>
                      </div>
                      <div className="task-details">
                        <div className="task-meta">
                          <span className="task-status">{task.status}</span>
                          <span className="task-time">
                            {task.time_stuck_hours}h (limit: {task.threshold_hours}h)
                          </span>
                        </div>
                        {task.assignee_name && (
                          <div className="task-assignee">
                            👤 {task.assignee_name}
                          </div>
                        )}
                        <div className="task-id">ID: {task.task_id}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Offline Agents */}
            {offlineAgents.length > 0 && (
              <div className="offline-agents-section">
                <h3>📴 Potentially Offline Agents ({offlineAgents.length})</h3>
                <div className="offline-agents-list">
                  {offlineAgents.map((agent) => (
                    <div key={agent.agent_id} className="offline-agent-item">
                      <div className="agent-info">
                        <span className="agent-name">{agent.agent_name}</span>
                        <span className="agent-status">{agent.status}</span>
                      </div>
                      <div className="agent-tasks">
                        {agent.assigned_task_count} assigned tasks
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* No Issues */}
            {stuckTasks.length === 0 && offlineAgents.length === 0 && lastCheck && (
              <div className="no-issues">
                <div className="success-icon">✅</div>
                <h3>All Clear!</h3>
                <p>No stuck tasks or offline agents detected.</p>
              </div>
            )}

            {/* Thresholds Info */}
            {monitorStatus?.thresholds && (
              <div className="thresholds-info">
                <h4>📋 Monitoring Thresholds</h4>
                <div className="thresholds-grid">
                  <div className="threshold-column">
                    <h5>Normal Priority</h5>
                    {Object.entries(monitorStatus.thresholds.normal).map(([status, hours]) => (
                      <div key={status} className="threshold-item">
                        <span className="threshold-status">{status}:</span>
                        <span className="threshold-time">{hours}h</span>
                      </div>
                    ))}
                  </div>
                  <div className="threshold-column">
                    <h5>Urgent Priority</h5>
                    {Object.entries(monitorStatus.thresholds.urgent).map(([status, hours]) => (
                      <div key={status} className="threshold-item">
                        <span className="threshold-status">{status}:</span>
                        <span className="threshold-time">{hours}h</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}