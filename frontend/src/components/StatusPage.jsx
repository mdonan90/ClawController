import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, RefreshCw, AlertTriangle, CheckCircle, Clock, Activity, Server, Users, Clipboard, Zap } from 'lucide-react'
import { api } from '../api'
import { useMissionStore } from '../store/useMissionStore'
import { formatTimeAgo, formatDuration, formatUptime } from '../utils/time'
import './StatusPage.css'

export default function StatusPage() {
  const navigate = useNavigate()
  const agents = useMissionStore((state) => state.agents)
  const tasks = useMissionStore((state) => state.tasks)
  
  const [gatewayStatus, setGatewayStatus] = useState(null)
  const [stuckTaskStatus, setStuckTaskStatus] = useState(null)
  const [stuckTasks, setStuckTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState(new Date())

  const fetchAllStatus = async () => {
    try {
      setLoading(true)
      
      // Fetch gateway status
      const gatewayData = await api.get('/api/monitoring/gateway/status')
      setGatewayStatus(gatewayData)
      
      // Fetch stuck task monitor status
      const stuckTaskData = await api.get('/api/monitoring/stuck-tasks/status')
      setStuckTaskStatus(stuckTaskData)
      
      // Run stuck task check to get current stuck tasks
      const stuckTaskCheck = await api.get('/api/monitoring/stuck-tasks/check')
      setStuckTasks(stuckTaskCheck.stuck_tasks || [])
      
      setLastRefresh(new Date())
    } catch (error) {
      console.error('Failed to fetch status data:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAllStatus()
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchAllStatus, 30000)
    return () => clearInterval(interval)
  }, [])

  const runHealthCheck = async () => {
    try {
      await api.post('/api/monitoring/gateway/health-check')
      await fetchAllStatus()
    } catch (error) {
      console.error('Health check failed:', error)
    }
  }

  const restartGateway = async () => {
    if (window.confirm('Restart the OpenClaw gateway? This may cause brief downtime.')) {
      try {
        const result = await api.post('/api/monitoring/gateway/restart')
        alert(result.success ? '✅ Gateway restart initiated' : '❌ Restart failed: ' + result.message)
        await fetchAllStatus()
      } catch (error) {
        console.error('Restart failed:', error)
        alert('❌ Restart request failed')
      }
    }
  }

  const runStuckTaskCheck = async () => {
    try {
      const result = await api.get('/api/monitoring/stuck-tasks/check')
      setStuckTasks(result.stuck_tasks || [])
      setLastRefresh(new Date())
    } catch (error) {
      console.error('Stuck task check failed:', error)
    }
  }

  // Calculate derived stats
  const workingAgents = agents.filter(a => a.status === 'WORKING').length
  const standbyAgents = agents.filter(a => a.status === 'STANDBY').length
  const offlineAgents = agents.filter(a => a.status === 'OFFLINE').length
  const totalAgents = agents.length

  const activeTasks = tasks.filter(t => t.status !== 'DONE').length
  const inProgressTasks = tasks.filter(t => t.status === 'IN_PROGRESS').length
  const reviewTasks = tasks.filter(t => t.status === 'REVIEW').length
  const assignedTasks = tasks.filter(t => t.status === 'ASSIGNED').length

  const getOverallHealth = () => {
    const gatewayHealthy = gatewayStatus?.health_status === 'healthy'
    const hasStuckTasks = stuckTasks.length > 0
    const hasOfflineAgents = offlineAgents > 0
    
    if (!gatewayHealthy) return 'critical'
    if (hasStuckTasks || hasOfflineAgents) return 'warning'
    return 'healthy'
  }

  const overallHealth = getOverallHealth()
  const healthColors = {
    healthy: '#22c55e',
    warning: '#f59e0b', 
    critical: '#ef4444'
  }

  const healthIcons = {
    healthy: <CheckCircle className="text-green-500" size={24} />,
    warning: <AlertTriangle className="text-yellow-500" size={24} />,
    critical: <AlertTriangle className="text-red-500" size={24} />
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

  if (loading && !gatewayStatus) {
    return (
      <div className="status-page">
        <div className="status-header">
          <button className="back-button" onClick={() => navigate('/')}>
            <ArrowLeft size={16} />
            Back to Dashboard
          </button>
          <h1>System Status</h1>
        </div>
        <div className="status-loading">
          <div className="loading-spinner" />
          <p>Loading system status...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="status-page">
      <div className="status-header">
        <button className="back-button" onClick={() => navigate('/')}>
          <ArrowLeft size={16} />
          Back to Dashboard
        </button>
        <h1>System Status</h1>
        <div className="status-actions">
          <button className="refresh-button" onClick={fetchAllStatus} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'spinning' : ''} />
            Refresh
          </button>
          <span className="last-refresh">
            Last updated: {formatTimeAgo(lastRefresh)}
          </span>
        </div>
      </div>

      {/* Overall Health Card */}
      <div className="health-overview">
        <div className="health-indicator">
          {healthIcons[overallHealth]}
          <div className="health-text">
            <h2 style={{ color: healthColors[overallHealth] }}>
              {overallHealth === 'healthy' ? 'System Healthy' : 
               overallHealth === 'warning' ? 'System Issues Detected' : 
               'Critical Issues Detected'}
            </h2>
            <p>
              {overallHealth === 'healthy' ? 'All systems operating normally' :
               overallHealth === 'warning' ? 'Some components need attention' :
               'Critical components require immediate attention'}
            </p>
          </div>
        </div>
        <div className="health-stats">
          <div className="health-stat">
            <span className="health-stat-value">{workingAgents}</span>
            <span className="health-stat-label">Working Agents</span>
          </div>
          <div className="health-stat">
            <span className="health-stat-value">{activeTasks}</span>
            <span className="health-stat-label">Active Tasks</span>
          </div>
          <div className="health-stat">
            <span className="health-stat-value">{stuckTasks.length}</span>
            <span className="health-stat-label">Stuck Tasks</span>
          </div>
        </div>
      </div>

      <div className="status-grid">
        {/* Gateway Status */}
        <div className="status-card">
          <div className="status-card-header">
            <div className="status-card-title">
              <Server size={20} />
              <h3>OpenClaw Gateway</h3>
            </div>
            <div className={`status-badge status-badge--${gatewayStatus?.health_status === 'healthy' ? 'healthy' : 'error'}`}>
              {gatewayStatus?.health_status === 'healthy' ? '✅ Healthy' : 
               gatewayStatus?.health_status === 'crashed' ? '🔴 Crashed' :
               '⚠️ Unknown'}
            </div>
          </div>
          
          <div className="status-card-content">
            {gatewayStatus && (
              <>
                <div className="status-metrics">
                  <div className="status-metric">
                    <span className="status-metric-label">Current Uptime</span>
                    <span className="status-metric-value">
                      {formatDuration(gatewayStatus.current_uptime_hours)}
                    </span>
                  </div>
                  <div className="status-metric">
                    <span className="status-metric-label">Total Uptime</span>
                    <span className="status-metric-value">
                      {formatDuration(gatewayStatus.total_uptime_hours)}
                    </span>
                  </div>
                  <div className="status-metric">
                    <span className="status-metric-label">Crash Count</span>
                    <span className={`status-metric-value ${gatewayStatus.crash_count > 0 ? 'error' : ''}`}>
                      {gatewayStatus.crash_count}
                    </span>
                  </div>
                  <div className="status-metric">
                    <span className="status-metric-label">Auto Restarts</span>
                    <span className="status-metric-value">{gatewayStatus.restart_count}</span>
                  </div>
                </div>
                
                {gatewayStatus.health_status !== 'healthy' && (
                  <div className="status-actions-row">
                    <button className="action-button" onClick={runHealthCheck}>
                      <Activity size={16} />
                      Health Check
                    </button>
                    <button className="action-button action-button--danger" onClick={restartGateway}>
                      <Zap size={16} />
                      Restart Gateway
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Agent Status */}
        <div className="status-card">
          <div className="status-card-header">
            <div className="status-card-title">
              <Users size={20} />
              <h3>Agent Status</h3>
            </div>
            <div className={`status-badge ${offlineAgents > 0 ? 'status-badge--warning' : 'status-badge--healthy'}`}>
              {totalAgents} Total
            </div>
          </div>
          
          <div className="status-card-content">
            <div className="agent-status-grid">
              <div className="agent-status-item agent-status-item--working">
                <div className="agent-status-count">{workingAgents}</div>
                <div className="agent-status-label">Working</div>
              </div>
              <div className="agent-status-item agent-status-item--standby">
                <div className="agent-status-count">{standbyAgents}</div>
                <div className="agent-status-label">Standby</div>
              </div>
              <div className="agent-status-item agent-status-item--offline">
                <div className="agent-status-count">{offlineAgents}</div>
                <div className="agent-status-label">Offline</div>
              </div>
            </div>
            
            {agents.length > 0 && (
              <div className="agent-list">
                {agents.map(agent => (
                  <div key={agent.id} className="agent-item">
                    <div className="agent-avatar">{agent.avatar}</div>
                    <div className="agent-info">
                      <div className="agent-name">{agent.name}</div>
                      <div className={`agent-status-text agent-status-text--${agent.status.toLowerCase()}`}>
                        {agent.status}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Task Status */}
        <div className="status-card">
          <div className="status-card-header">
            <div className="status-card-title">
              <Clipboard size={20} />
              <h3>Task Overview</h3>
            </div>
            <div className={`status-badge ${stuckTasks.length > 0 ? 'status-badge--warning' : 'status-badge--healthy'}`}>
              {activeTasks} Active
            </div>
          </div>
          
          <div className="status-card-content">
            <div className="task-status-grid">
              <div className="task-status-item">
                <div className="task-status-count">{assignedTasks}</div>
                <div className="task-status-label">Assigned</div>
              </div>
              <div className="task-status-item">
                <div className="task-status-count">{inProgressTasks}</div>
                <div className="task-status-label">In Progress</div>
              </div>
              <div className="task-status-item">
                <div className="task-status-count">{reviewTasks}</div>
                <div className="task-status-label">Review</div>
              </div>
              <div className="task-status-item">
                <div className="task-status-count task-status-count--stuck">{stuckTasks.length}</div>
                <div className="task-status-label">Stuck</div>
              </div>
            </div>
          </div>
        </div>

        {/* Stuck Task Monitor */}
        <div className="status-card">
          <div className="status-card-header">
            <div className="status-card-title">
              <Clock size={20} />
              <h3>Stuck Task Monitor</h3>
            </div>
            <div className="status-actions-header">
              <button className="action-button-small" onClick={runStuckTaskCheck}>
                <RefreshCw size={14} />
                Check Now
              </button>
            </div>
          </div>
          
          <div className="status-card-content">
            {stuckTaskStatus && (
              <div className="monitor-stats-grid">
                <div className="monitor-stat">
                  <span className="monitor-stat-label">Total Notifications</span>
                  <span className="monitor-stat-value">{stuckTaskStatus.total_notifications_sent}</span>
                </div>
                <div className="monitor-stat">
                  <span className="monitor-stat-label">Tracked Tasks</span>
                  <span className="monitor-stat-value">{stuckTaskStatus.currently_tracked_tasks}</span>
                </div>
                <div className="monitor-stat">
                  <span className="monitor-stat-label">Last Run</span>
                  <span className="monitor-stat-value">{formatTimeAgo(stuckTaskStatus.last_run)}</span>
                </div>
              </div>
            )}
            
            {stuckTasks.length > 0 ? (
              <div className="stuck-tasks-list">
                <h4>🚨 Currently Stuck Tasks ({stuckTasks.length})</h4>
                {stuckTasks.map((task) => (
                  <div key={task.task_id} className="stuck-task-item">
                    <div className="stuck-task-header">
                      <span className="severity-icon">
                        {getSeverityIcon(task.time_stuck_hours, task.priority)}
                      </span>
                      <span className="stuck-task-title">{task.title}</span>
                      <span className={`stuck-task-priority ${task.priority.toLowerCase()}`}>
                        {task.priority}
                      </span>
                    </div>
                    <div className="stuck-task-details">
                      <div className="stuck-task-meta">
                        <span className="stuck-task-status">{task.status}</span>
                        <span className="stuck-task-time">
                          {task.time_stuck_hours}h (limit: {task.threshold_hours}h)
                        </span>
                      </div>
                      {task.assignee_name && (
                        <div className="stuck-task-assignee">
                          👤 {task.assignee_name}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="no-stuck-tasks">
                <CheckCircle size={24} className="text-green-500" />
                <p>No stuck tasks detected</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Monitoring Thresholds */}
      {stuckTaskStatus?.thresholds && (
        <div className="status-card status-card--full-width">
          <div className="status-card-header">
            <div className="status-card-title">
              <Activity size={20} />
              <h3>Monitoring Configuration</h3>
            </div>
          </div>
          
          <div className="status-card-content">
            <div className="thresholds-grid">
              <div className="threshold-column">
                <h4>Normal Priority Thresholds</h4>
                <div className="threshold-list">
                  {Object.entries(stuckTaskStatus.thresholds.normal).map(([status, hours]) => (
                    <div key={status} className="threshold-item">
                      <span className="threshold-status">{status}:</span>
                      <span className="threshold-time">{hours}h</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="threshold-column">
                <h4>Urgent Priority Thresholds</h4>
                <div className="threshold-list">
                  {Object.entries(stuckTaskStatus.thresholds.urgent).map(([status, hours]) => (
                    <div key={status} className="threshold-item">
                      <span className="threshold-status">{status}:</span>
                      <span className="threshold-time">{hours}h</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="threshold-column">
                <h4>Gateway Watchdog</h4>
                <div className="threshold-list">
                  <div className="threshold-item">
                    <span className="threshold-status">Check Interval:</span>
                    <span className="threshold-time">{gatewayStatus?.config?.check_interval_seconds}s</span>
                  </div>
                  <div className="threshold-item">
                    <span className="threshold-status">Health Timeout:</span>
                    <span className="threshold-time">{gatewayStatus?.config?.health_check_timeout}s</span>
                  </div>
                  <div className="threshold-item">
                    <span className="threshold-status">Max Restarts:</span>
                    <span className="threshold-time">{gatewayStatus?.config?.max_restart_attempts}</span>
                  </div>
                  <div className="threshold-item">
                    <span className="threshold-status">Notification Cooldown:</span>
                    <span className="threshold-time">{gatewayStatus?.config?.notification_cooldown_minutes}m</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}