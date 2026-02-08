import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ExternalLink } from 'lucide-react'
import { api } from '../api'
import { formatTimeAgo } from '../utils/time'
import './StuckTaskMonitor.css'

export default function StuckTaskMonitor() {
  const navigate = useNavigate()
  const [isOpen, setIsOpen] = useState(false)
  const [stuckTasks, setStuckTasks] = useState([])
  const [loading, setLoading] = useState(false)
  const [lastCheck, setLastCheck] = useState(null)

  const viewFullStatus = () => {
    navigate('/status')
  }

  const runStuckTaskCheck = async () => {
    setLoading(true)
    try {
      const result = await api.get('/api/monitoring/stuck-tasks/check')
      setStuckTasks(result.stuck_tasks || [])
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

  const hasIssues = stuckTasks.length > 0
  
  // Get oldest stuck task
  const oldestStuckTask = stuckTasks.length > 0 
    ? stuckTasks.reduce((oldest, task) => 
        task.time_stuck_hours > (oldest?.time_stuck_hours || 0) ? task : oldest, null)
    : null

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
          <span className="monitor-label">Tasks</span>
          {hasIssues && (
            <span className="issue-badge">
              {stuckTasks.length}
            </span>
          )}
        </button>
      </div>

      {/* Monitor Panel - Simplified */}
      {isOpen && (
        <div className="stuck-task-modal">
          <div className="stuck-task-content">
            <div className="stuck-task-header">
              <h2>📋 Task Status</h2>
              <button className="close-btn" onClick={() => setIsOpen(false)}>×</button>
            </div>

            <div className="task-summary">
              <div className="task-count-display">
                <div className="task-count">
                  {stuckTasks.length}
                </div>
                <div className="task-count-label">
                  {stuckTasks.length === 1 ? 'Stuck Task' : 'Stuck Tasks'}
                </div>
              </div>

              {oldestStuckTask && (
                <div className="oldest-task-info">
                  <div className="oldest-task-label">Oldest stuck:</div>
                  <div className="oldest-task-title">{oldestStuckTask.title}</div>
                  <div className="oldest-task-time">
                    {getSeverityIcon(oldestStuckTask.time_stuck_hours, oldestStuckTask.priority)} 
                    {oldestStuckTask.time_stuck_hours}h in {oldestStuckTask.status}
                  </div>
                </div>
              )}

              {stuckTasks.length === 0 && (
                <div className="no-stuck-tasks">
                  <div className="success-icon">✅</div>
                  <p>No stuck tasks detected</p>
                </div>
              )}

              <div className="task-actions">
                <button 
                  className="check-btn-small"
                  onClick={runStuckTaskCheck}
                  disabled={loading}
                >
                  {loading ? '⏳' : '🔄'} Check Now
                </button>
                <button 
                  className="detail-btn"
                  onClick={viewFullStatus}
                >
                  <ExternalLink size={14} />
                  View Details
                </button>
              </div>

              {lastCheck && (
                <div className="last-check-info">
                  Last check: {formatTimeAgo(lastCheck)}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}