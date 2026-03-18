import { Plus, Bot, Rocket, Zap, Target } from 'lucide-react'
import { DndContext, DragOverlay, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { useState } from 'react'
import { statusColors, statusOrder, useMissionStore } from '../store/useMissionStore'
import KanbanColumn from './KanbanColumn'
import TaskCard from './TaskCard'
import { useIsMobile } from '../hooks/useMediaQuery'

export default function KanbanBoard() {
  const tasks = useMissionStore((state) => state.tasks)
  const selectedAgentId = useMissionStore((state) => state.selectedAgentId)
  const moveTask = useMissionStore((state) => state.moveTask)
  const openNewTask = useMissionStore((state) => state.openNewTask)
  const openAgentManagement = useMissionStore((state) => state.openAgentManagement)
  const agents = useMissionStore((state) => state.agents)
  
  const [activeTask, setActiveTask] = useState(null)
  const [activeColumn, setActiveColumn] = useState('INBOX')
  const isMobile = useIsMobile()
  
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  )
  
  // Filter tasks by selected agent
  const filteredTasks = selectedAgentId 
    ? tasks.filter(task => task.assignedTo === selectedAgentId)
    : tasks
  
  const selectedAgent = selectedAgentId 
    ? agents.find(a => a.id === selectedAgentId) 
    : null

  const handleDragStart = (event) => {
    const { active } = event
    const task = tasks.find(t => t.id === active.id)
    setActiveTask(task)
  }

  const handleDragEnd = (event) => {
    const { active, over } = event
    setActiveTask(null)
    
    if (!over) return
    
    const taskId = active.id
    const newStatus = over.id
    
    // Validate that we're dropping on a valid status column
    if (statusOrder.includes(newStatus)) {
      moveTask(taskId, newStatus)
    }
  }

  // Show empty state when no agents exist
  if (agents.length === 0) {
    return (
      <section className="kanban">
        <div className="kanban-toolbar">
          <button className="add-task-button" onClick={openAgentManagement}>
            <Bot size={16} />
            Create Agent
          </button>
        </div>
        
        <div className="kanban-empty-state">
          <div className="empty-dashboard">
            <div className="empty-dashboard-icon">
              <Rocket size={64} />
            </div>
            <h2 className="empty-dashboard-title">Ready to Launch Your AI Fleet!</h2>
            <p className="empty-dashboard-description">
              ClawController is your mission control for AI agents. Create your first agent to start automating tasks, 
              managing projects, and orchestrating your workflow.
            </p>
            
            <div className="getting-started-steps">
              <div className="step">
                <div className="step-icon">
                  <Bot size={24} />
                </div>
                <div className="step-content">
                  <h3>1. Create Your First Agent</h3>
                  <p>Design an AI agent with a specific role (developer, analyst, manager)</p>
                </div>
              </div>
              
              <div className="step">
                <div className="step-icon">
                  <Target size={24} />
                </div>
                <div className="step-content">
                  <h3>2. Assign Tasks</h3>
                  <p>Create tasks and mention agents with @agentname to assign work</p>
                </div>
              </div>
              
              <div className="step">
                <div className="step-icon">
                  <Zap size={24} />
                </div>
                <div className="step-content">
                  <h3>3. Watch the Magic</h3>
                  <p>Your agents collaborate, complete tasks, and keep you updated</p>
                </div>
              </div>
            </div>
            
            <button 
              className="primary-cta-button"
              onClick={openAgentManagement}
            >
              <Plus size={20} />
              Create Your First Agent
            </button>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="kanban">
      <div className="kanban-toolbar">
        {selectedAgent && (
          <span className="filter-indicator">
            Filtering by <span className="filter-agent" style={{ color: selectedAgent.color }}>
              {selectedAgent.avatar} {selectedAgent.name}
            </span>
            <button className="clear-filter" onClick={() => useMissionStore.getState().clearAgentFilter()}>
              Clear
            </button>
          </span>
        )}
        <button className="add-task-button" onClick={openNewTask}>
          <Plus size={16} />
          New Task
        </button>
        <button className="add-task-button" onClick={openAgentManagement} style={{ marginLeft: '8px' }}>
          <Bot size={16} />
          Manage Agents
        </button>
      </div>
      
      <DndContext 
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        {/* Mobile Tab Navigation */}
        {isMobile && (
          <div className="kanban-mobile-tabs">
            {statusOrder.map((status) => {
              const columnTasks = filteredTasks.filter((task) => task.status === status)
              return (
                <button
                  key={status}
                  className={`kanban-tab ${activeColumn === status ? 'active' : ''}`}
                  onClick={() => setActiveColumn(status)}
                >
                  <span className="kanban-tab-label">{status}</span>
                  {columnTasks.length > 0 && (
                    <span className="kanban-tab-badge">{columnTasks.length}</span>
                  )}
                </button>
              )
            })}
          </div>
        )}
        
        <div className="kanban-grid">
          {statusOrder.map((status) => {
            const columnTasks = filteredTasks.filter((task) => task.status === status)
            const isActiveOnMobile = !isMobile || status === activeColumn
            
            return (
              <KanbanColumn
                key={status}
                title={status}
                tasks={columnTasks}
                color={statusColors[status]}
                className={isActiveOnMobile ? 'active' : ''}
              />
            )
          })}
        </div>
        
        <DragOverlay>
          {activeTask ? (
            <div className="task-card-overlay">
              <TaskCard task={activeTask} isDragging isOverlay />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </section>
  )
}
