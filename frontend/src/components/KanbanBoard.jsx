import { Plus, Bot } from 'lucide-react'
import { DndContext, DragOverlay, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { useState } from 'react'
import { statusColors, statusOrder, useMissionStore } from '../store/useMissionStore'
import KanbanColumn from './KanbanColumn'
import TaskCard from './TaskCard'

export default function KanbanBoard() {
  const tasks = useMissionStore((state) => state.tasks)
  const selectedAgentId = useMissionStore((state) => state.selectedAgentId)
  const moveTask = useMissionStore((state) => state.moveTask)
  const openNewTask = useMissionStore((state) => state.openNewTask)
  const openAgentManagement = useMissionStore((state) => state.openAgentManagement)
  const agents = useMissionStore((state) => state.agents)
  
  const [activeTask, setActiveTask] = useState(null)
  
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
        <div className="kanban-grid">
          {statusOrder.map((status) => {
            const columnTasks = filteredTasks.filter((task) => task.status === status)
            return (
              <KanbanColumn
                key={status}
                title={status}
                tasks={columnTasks}
                color={statusColors[status]}
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
