import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import './App.css'
import { getStoredApiKey } from './api'
import clawLogo from './assets/clawcontroller-logo.jpg'
import AgentManagement from './components/AgentManagement'
import AgentSidebar from './components/AgentSidebar'
import AnnouncementModal from './components/AnnouncementModal'
import ChatWidget from './components/ChatWidget'
import Header from './components/Header'
import KanbanBoard from './components/KanbanBoard'
import LiveFeed from './components/LiveFeed'
import NewTaskModal from './components/NewTaskModal'
import RecurringTasksPanel from './components/RecurringTasksPanel'
import TaskModal from './components/TaskModal'
import { useMissionStore } from './store/useMissionStore'

function LoadingScreen() {
  return (
    <div className="loading-screen">
      <div className="loading-content">
        <img src={clawLogo} alt="ClawController" className="loading-logo" />
        <h2>ClawController</h2>
        <p>Initializing systems...</p>
      </div>
    </div>
  )
}

function ErrorScreen({ error, onRetry }) {
  return (
    <div className="error-screen">
      <div className="error-content">
        <div className="error-icon">⚠️</div>
        <h2>Connection Failed</h2>
        <p>{error}</p>
        <button className="retry-button" onClick={onRetry}>
          Retry Connection
        </button>
        <p className="error-hint">
          Make sure the backend is running at http://localhost:8000
        </p>
      </div>
    </div>
  )
}

function App() {
  const navigate = useNavigate()
  const initialize = useMissionStore((state) => state.initialize)
  const connectWebSocket = useMissionStore((state) => state.connectWebSocket)
  const disconnectWebSocket = useMissionStore((state) => state.disconnectWebSocket)
  const refreshAgents = useMissionStore((state) => state.refreshAgents)
  const isLoading = useMissionStore((state) => state.isLoading)
  const isInitialized = useMissionStore((state) => state.isInitialized)
  const error = useMissionStore((state) => state.error)
  const wsConnected = useMissionStore((state) => state.wsConnected)

  useEffect(() => {
    // Check for API Key
    if (!getStoredApiKey()) {
      navigate('/login')
      return
    }

    // Initialize data on mount
    initialize()
    
    // Connect WebSocket
    connectWebSocket()
    
    // Refresh agent status every 30 seconds for real-time updates
    const agentRefreshInterval = setInterval(() => {
      refreshAgents()
    }, 30000)
    
    // Cleanup on unmount
    return () => {
      disconnectWebSocket()
      clearInterval(agentRefreshInterval)
    }
  }, [initialize, connectWebSocket, disconnectWebSocket, refreshAgents])

  // Show loading screen while initializing
  if (isLoading && !isInitialized) {
    return <LoadingScreen />
  }

  // Show error screen if initialization failed
  if (error && !isInitialized) {
    return <ErrorScreen error={error} onRetry={initialize} />
  }

  return (
    <div className="app">
      <Header />
      <main className="main">
        <AgentSidebar />
        <KanbanBoard />
        <div className="right-panel">
          <LiveFeed />
        </div>
      </main>
      <TaskModal />
      <AnnouncementModal />
      <NewTaskModal />
      <RecurringTasksPanel />
      <AgentManagement />
      <ChatWidget />
    </div>
  )
}

export default App
