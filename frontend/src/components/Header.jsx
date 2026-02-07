import { Bell, Clock, TrendingUp, TrendingDown, CheckCircle2, BarChart3, X, RefreshCw, Activity, Wifi, WifiOff, AlertTriangle, Bot } from 'lucide-react'
import { useEffect, useState, useRef } from 'react'
import { useMissionStore } from '../store/useMissionStore'
import { formatDistanceToNow } from 'date-fns'
import clawLogo from '../assets/clawcontroller-logo.jpg'

const formatTime = (date) =>
  date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit'
  })

// Simple sparkline component
function Sparkline({ data, width = 80, height = 24 }) {
  if (!data || data.length === 0) return null
  
  const max = Math.max(...data, 1)
  const min = 0
  const range = max - min || 1
  
  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * width
    const y = height - ((value - min) / range) * height
    return `${x},${y}`
  }).join(' ')
  
  return (
    <svg width={width} height={height} className="sparkline">
      <polyline
        fill="none"
        stroke="var(--accent)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  )
}

// Notifications Dropdown
function NotificationsDropdown() {
  const agents = useMissionStore((state) => state.agents)
  const getMyNotifications = useMissionStore((state) => state.getMyNotifications)
  const markAllNotificationsRead = useMissionStore((state) => state.markAllNotificationsRead)
  const openTaskFromNotification = useMissionStore((state) => state.openTaskFromNotification)
  const closeNotifications = useMissionStore((state) => state.closeNotifications)
  
  const notifications = getMyNotifications()
  
  const handleNotificationClick = (notif) => {
    openTaskFromNotification(notif.id, notif.taskId)
  }
  
  return (
    <div className="notifications-dropdown">
      <div className="notifications-header">
        <h4>Notifications</h4>
        <div className="notifications-actions">
          {notifications.some(n => !n.read) && (
            <button 
              className="mark-all-read"
              onClick={markAllNotificationsRead}
            >
              Mark all read
            </button>
          )}
          <button className="close-notifications" onClick={closeNotifications}>
            <X size={16} />
          </button>
        </div>
      </div>
      <div className="notifications-list">
        {notifications.length === 0 ? (
          <div className="notifications-empty">
            <Bell size={24} />
            <span>No notifications</span>
          </div>
        ) : (
          notifications.map((notif) => {
            const fromAgent = agents.find(a => a.id === notif.fromAgentId)
            return (
              <button
                key={notif.id}
                className={`notification-item ${notif.read ? 'read' : 'unread'}`}
                onClick={() => handleNotificationClick(notif)}
              >
                <div 
                  className="notification-avatar"
                  style={{ backgroundColor: fromAgent?.color }}
                >
                  {fromAgent?.avatar}
                </div>
                <div className="notification-content">
                  <div className="notification-title">
                    <strong>{fromAgent?.name}</strong> mentioned you
                  </div>
                  <div className="notification-text">{notif.text}</div>
                  <div className="notification-time">
                    {formatDistanceToNow(new Date(notif.timestamp), { addSuffix: true })}
                  </div>
                </div>
                {!notif.read && <div className="notification-unread-dot" />}
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}

// System Status Dropdown
function SystemStatusDropdown({ onClose }) {
  const agents = useMissionStore((state) => state.agents)
  const wsConnected = useMissionStore((state) => state.wsConnected)
  const useOpenClaw = useMissionStore((state) => state.useOpenClaw)
  const error = useMissionStore((state) => state.error)
  const dropdownRef = useRef(null)
  
  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])
  
  const workingAgents = agents.filter(a => a.status === 'WORKING').length
  const standbyAgents = agents.filter(a => a.status === 'STANDBY').length
  const offlineAgents = agents.filter(a => a.status === 'OFFLINE').length
  
  return (
    <div className="status-dropdown" ref={dropdownRef}>
      <div className="status-dropdown-header">
        <Activity size={16} />
        <span>System Status</span>
        <button className="close-status" onClick={onClose}>
          <X size={14} />
        </button>
      </div>
      
      <div className="status-section">
        <div className="status-row">
          <span className="status-row-label">WebSocket</span>
          <span className={`status-row-value ${wsConnected ? 'healthy' : 'error'}`}>
            {wsConnected ? <Wifi size={14} /> : <WifiOff size={14} />}
            {wsConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
        
        <div className="status-row">
          <span className="status-row-label">OpenClaw</span>
          <span className={`status-row-value ${useOpenClaw ? 'healthy' : 'degraded'}`}>
            {useOpenClaw ? '🦞 Integrated' : 'Standalone'}
          </span>
        </div>
        
        <div className="status-row">
          <span className="status-row-label">API</span>
          <span className={`status-row-value ${error ? 'error' : 'healthy'}`}>
            {error ? 'Error' : 'Healthy'}
          </span>
        </div>
      </div>
      
      <div className="status-section">
        <div className="status-section-title">Agents</div>
        <div className="status-agents-grid status-agents-grid--3">
          <div className="status-agent-stat">
            <span className="status-agent-count healthy">{workingAgents}</span>
            <span className="status-agent-label">Working</span>
          </div>
          <div className="status-agent-stat">
            <span className="status-agent-count standby">{standbyAgents}</span>
            <span className="status-agent-label">Standby</span>
          </div>
          <div className="status-agent-stat">
            <span className="status-agent-count error">{offlineAgents}</span>
            <span className="status-agent-label">Offline</span>
          </div>
        </div>
      </div>
      
      {error && (
        <div className="status-error">
          <AlertTriangle size={14} />
          <span>{error}</span>
        </div>
      )}
    </div>
  )
}

export default function Header() {
  const agents = useMissionStore((state) => state.agents)
  const tasks = useMissionStore((state) => state.tasks)
  const recurringTasks = useMissionStore((state) => state.recurringTasks)
  const toggleRecurringPanel = useMissionStore((state) => state.toggleRecurringPanel)
  const openAgentManagement = useMissionStore((state) => state.openAgentManagement)
  const getUnreadCount = useMissionStore((state) => state.getUnreadCount)
  const isNotificationsOpen = useMissionStore((state) => state.isNotificationsOpen)
  const toggleNotifications = useMissionStore((state) => state.toggleNotifications)
  const getStats = useMissionStore((state) => state.getStats)
  const wsConnected = useMissionStore((state) => state.wsConnected)
  const error = useMissionStore((state) => state.error)
  
  const [now, setNow] = useState(() => formatTime(new Date()))
  const [showStats, setShowStats] = useState(false)
  const [showStatus, setShowStatus] = useState(false)

  useEffect(() => {
    const timer = setInterval(() => setNow(formatTime(new Date())), 1000)
    return () => clearInterval(timer)
  }, [])

  const activeAgents = agents.filter((agent) => agent.status === 'WORKING').length
  const offlineAgents = agents.filter((agent) => agent.status === 'OFFLINE').length
  const taskQueue = tasks.filter((task) => task.status !== 'DONE').length
  const activeRecurring = recurringTasks.filter((t) => t.is_active).length
  const unreadCount = getUnreadCount()
  const stats = getStats()

  // Determine overall system status
  // STANDBY is fine (agents ready to activate), only truly OFFLINE is degraded
  const getSystemStatus = () => {
    if (error || !wsConnected) return 'error'
    if (offlineAgents > 0) return 'degraded'  // Only truly offline agents degrade status
    return 'healthy'
  }
  
  const systemStatus = getSystemStatus()
  const statusLabels = {
    healthy: 'Healthy',
    degraded: 'Degraded',
    error: 'Error'
  }

  return (
    <header className="header">
      <div className="logo">
        <div className="logo-icon logo-claw">
          <img src={clawLogo} alt="ClawController" className="logo-image" />
        </div>
        <div>
          <div className="logo-title header-title">CLAWCONTROLLER</div>
          <div className="logo-subtitle">Multi-Agent Orchestration</div>
        </div>
      </div>

      <div className="header-stats">
        <div className="stat-pill">
          <span className="stat-value">{activeAgents}</span>
          <span className="stat-label">AGENTS ACTIVE</span>
        </div>
        <div className="stat-pill">
          <span className="stat-value">{taskQueue}</span>
          <span className="stat-label">TASKS IN QUEUE</span>
        </div>
        
        {/* Stats Toggle */}
        <div className="stats-container">
          <button 
            className={`stat-pill stat-pill--interactive ${showStats ? 'active' : ''}`}
            onClick={() => setShowStats(!showStats)}
          >
            <BarChart3 size={16} />
            <span className="stat-value">{stats.completedToday}</span>
            <span className="stat-label">DONE TODAY</span>
            {stats.trend !== 0 && (
              <span className={`stat-trend ${stats.trend > 0 ? 'positive' : 'negative'}`}>
                {stats.trend > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                {Math.abs(stats.trend)}
              </span>
            )}
          </button>
          
          {showStats && (
            <div className="stats-dropdown">
              <div className="stats-dropdown-header">
                <CheckCircle2 size={16} />
                <span>Completion Stats</span>
              </div>
              <div className="stats-grid">
                <div className="stats-item">
                  <div className="stats-item-value">{stats.completedToday}</div>
                  <div className="stats-item-label">Today</div>
                </div>
                <div className="stats-item">
                  <div className="stats-item-value">{stats.completedYesterday}</div>
                  <div className="stats-item-label">Yesterday</div>
                </div>
                <div className="stats-item">
                  <div className="stats-item-value">{stats.completedThisWeek}</div>
                  <div className="stats-item-label">This Week</div>
                </div>
              </div>
              <div className="stats-trend-section">
                <span className="stats-trend-label">7-Day Trend</span>
                <Sparkline data={stats.weekData} />
                <span className={`stats-trend-value ${stats.trend > 0 ? 'positive' : stats.trend < 0 ? 'negative' : ''}`}>
                  {stats.trend > 0 ? '↑' : stats.trend < 0 ? '↓' : '→'} 
                  {stats.trend > 0 ? `${stats.trend} more than yesterday` : 
                   stats.trend < 0 ? `${Math.abs(stats.trend)} less than yesterday` : 
                   'Same as yesterday'}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="header-actions">
        {/* Agent Management Button */}
        <button 
          className="agent-mgmt-button pulse-glow"
          onClick={openAgentManagement}
          title="Manage Agents"
        >
          <Bot size={18} />
        </button>
        
        {/* Recurring Tasks Button */}
        <button 
          className={`recurring-button ${activeRecurring > 0 ? 'has-active' : ''}`}
          onClick={toggleRecurringPanel}
          title="Recurring Tasks"
        >
          <RefreshCw size={16} />
          {activeRecurring > 0 && (
            <span className="recurring-badge">{activeRecurring}</span>
          )}
        </button>
        
        {/* Notifications Bell */}
        <div className="notifications-container">
          <button 
            className={`notification-bell ${unreadCount > 0 ? 'has-unread' : ''}`}
            onClick={toggleNotifications}
          >
            <Bell size={18} />
            {unreadCount > 0 && (
              <span className="notification-badge">{unreadCount}</span>
            )}
          </button>
          {isNotificationsOpen && <NotificationsDropdown />}
        </div>
        
        <div className="time-block">
          <Clock size={16} />
          <span>{now}</span>
        </div>
        
        {/* Consolidated System Status */}
        <div className="system-status-container">
          <button 
            className={`system-status-pill system-status-pill--${systemStatus}`}
            onClick={() => setShowStatus(!showStatus)}
          >
            <span className="system-status-dot" />
            {statusLabels[systemStatus]}
          </button>
          {showStatus && <SystemStatusDropdown onClose={() => setShowStatus(false)} />}
        </div>
      </div>
    </header>
  )
}
