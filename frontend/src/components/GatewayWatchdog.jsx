import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ExternalLink } from 'lucide-react'
import { api } from '../api'
import { formatTimeAgo, formatDuration } from '../utils/time'
import './GatewayWatchdog.css'

export default function GatewayWatchdog() {
  const navigate = useNavigate()
  const [isOpen, setIsOpen] = useState(false)
  const [watchdogStatus, setWatchdogStatus] = useState(null)
  const [loading, setLoading] = useState(false)

  // Auto-refresh watchdog status every 30 seconds
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const status = await api.get('/api/monitoring/gateway/status')
        setWatchdogStatus(status)
      } catch (error) {
        console.error('Failed to fetch gateway watchdog status:', error)
      }
    }
    
    fetchStatus()
    const interval = setInterval(fetchStatus, 30 * 1000) // 30 seconds
    
    return () => clearInterval(interval)
  }, [])

  const viewFullStatus = () => {
    navigate('/status')
  }

  const getHealthStatusIcon = (status) => {
    switch (status) {
      case 'healthy': return '✅'
      case 'crashed': return '🔴'
      case 'down': return '🔴'
      case 'unknown': return '❓'
      default: return '⚠️'
    }
  }

  const getHealthStatusColor = (status) => {
    switch (status) {
      case 'healthy': return '#22c55e'
      case 'crashed': return '#ef4444'
      case 'down': return '#ef4444'
      case 'unknown': return '#94a3b8'
      default: return '#f59e0b'
    }
  }

  const isGatewayHealthy = watchdogStatus?.health_status === 'healthy'
  const hasIssues = !isGatewayHealthy && watchdogStatus?.health_status !== 'unknown'

  return (
    <>
      {/* Gateway Status Widget */}
      <div className={`gateway-widget ${hasIssues ? 'has-issues' : ''}`}>
        <button 
          className="widget-toggle"
          onClick={() => setIsOpen(!isOpen)}
          title="Gateway Watchdog"
        >
          <span className="gateway-icon">
            {hasIssues ? '🔴' : '🟢'}
          </span>
          <span className="gateway-label">Gateway</span>
          {hasIssues && (
            <span className="issue-badge">!</span>
          )}
        </button>
      </div>

      {/* Gateway Panel - Simplified */}
      {isOpen && (
        <div className="gateway-modal">
          <div className="gateway-content">
            <div className="gateway-header">
              <h2>🛡️ Gateway Status</h2>
              <button className="close-btn" onClick={() => setIsOpen(false)}>×</button>
            </div>

            {watchdogStatus && (
              <div className="gateway-summary">
                <div className="gateway-status-indicator">
                  <span 
                    className="status-icon"
                    style={{ color: getHealthStatusColor(watchdogStatus.health_status) }}
                  >
                    {getHealthStatusIcon(watchdogStatus.health_status)}
                  </span>
                  <span 
                    className="status-text"
                    style={{ color: getHealthStatusColor(watchdogStatus.health_status) }}
                  >
                    {watchdogStatus.health_status?.toUpperCase() || 'UNKNOWN'}
                  </span>
                </div>
                
                <div className="gateway-quick-stats">
                  <div className="quick-stat">
                    <span className="quick-stat-label">Uptime:</span>
                    <span className="quick-stat-value">
                      {formatDuration(watchdogStatus.current_uptime_hours)}
                    </span>
                  </div>
                  <div className="quick-stat">
                    <span className="quick-stat-label">Crashes:</span>
                    <span className={`quick-stat-value ${watchdogStatus.crash_count > 0 ? 'warning' : ''}`}>
                      {watchdogStatus.crash_count}
                    </span>
                  </div>
                  <div className="quick-stat">
                    <span className="quick-stat-label">Last Check:</span>
                    <span className="quick-stat-value">
                      {formatTimeAgo(watchdogStatus.last_check)}
                    </span>
                  </div>
                </div>

                <div className="gateway-actions">
                  <button 
                    className="gateway-detail-btn"
                    onClick={viewFullStatus}
                  >
                    <ExternalLink size={14} />
                    View Full Status
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}