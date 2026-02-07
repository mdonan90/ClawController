import { Clock, AlarmClock, GripVertical, Calendar } from 'lucide-react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useMissionStore, priorityColors } from '../store/useMissionStore'
import { format, isPast, isToday, isTomorrow } from 'date-fns'

// Format due date for display
function formatDueDate(dueAt) {
  if (!dueAt) return null
  const date = new Date(dueAt)
  
  if (isToday(date)) return 'Due Today'
  if (isTomorrow(date)) return 'Due Tomorrow'
  if (isPast(date)) return `Overdue`
  
  return `Due ${format(date, 'MMM d')}`
}

// Check if task is overdue
function isOverdue(dueAt, status) {
  if (!dueAt || status === 'DONE') return false
  return isPast(new Date(dueAt)) && !isToday(new Date(dueAt))
}

// Base card component (no DnD)
function TaskCardContent({ task, isDragging = false, showHandle = true, onHandleProps = {} }) {
  const agents = useMissionStore((state) => state.agents)
  const selectTask = useMissionStore((state) => state.selectTask)
  
  // Get agent - prefer embedded agent data, fallback to lookup
  const agent = task.assignee || agents.find((item) => item.id === task.assignedTo)
  
  const dueLabel = formatDueDate(task.dueAt)
  const overdue = isOverdue(task.dueAt, task.status)

  const handleClick = (e) => {
    if (!isDragging) {
      selectTask(task.id)
    }
  }

  return (
    <div
      className={`task-card ${isDragging ? 'task-card--dragging' : ''} ${overdue ? 'task-card--overdue' : ''}`}
      onClick={handleClick}
    >
      {showHandle && (
        <div className="task-card-drag-handle" {...onHandleProps}>
          <GripVertical size={14} />
        </div>
      )}
      <div className="task-card-content">
        <div className="task-card-header">
          <h4>{task.title}</h4>
          {task.priority === 'URGENT' && (
            <span className="priority priority--urgent">
              <AlarmClock size={12} />
              URGENT
            </span>
          )}
        </div>
        <p className="task-desc">{task.description}</p>
        <div className="task-tags">
          {(task.tags || []).map((tag) => (
            <span key={tag} className="tag">
              {tag}
            </span>
          ))}
        </div>
        <div className="task-meta">
          {agent && (
            <div className="task-agent">
              <span className="agent-dot" style={{ backgroundColor: agent.color || '#6B7280' }} />
              {agent.name}
            </div>
          )}
          {dueLabel && (
            <div className={`task-due ${overdue ? 'task-due--overdue' : ''}`}>
              <Calendar size={12} />
              {dueLabel}
            </div>
          )}
          {task.status === 'REVIEW' && task.reviewer && (
            <div className="task-reviewer" title={`Awaiting review from ${task.reviewer}`}>
              {task.reviewer === 'human' ? '👤' : '🤖'} Review: {task.reviewer}
            </div>
          )}
          <div className="task-time">
            <Clock size={12} />
            {task.timestamp}
          </div>
        </div>
      </div>
    </div>
  )
}

// Sortable wrapper component
export default function TaskCard({ task, isDragging = false, isOverlay = false }) {
  // For overlay cards, just render the content without sortable
  if (isOverlay) {
    return <TaskCardContent task={task} isDragging={isDragging} showHandle={false} />
  }

  // For normal cards in the list, use sortable
  return <SortableTaskCard task={task} />
}

// Separate component that uses the hook
function SortableTaskCard({ task }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style}>
      <TaskCardContent 
        task={task} 
        isDragging={isDragging}
        showHandle={true}
        onHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  )
}
