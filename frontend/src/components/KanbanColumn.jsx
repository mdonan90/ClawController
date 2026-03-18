import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import TaskCard from './TaskCard'

export default function KanbanColumn({ title, tasks, color, className = '' }) {
  const { isOver, setNodeRef } = useDroppable({
    id: title,
  })
  
  const taskIds = tasks.map(task => task.id)

  return (
    <div 
      ref={setNodeRef}
      className={`kanban-column ${isOver ? 'kanban-column--over' : ''} ${className}`}
    >
      <div className="kanban-column-header" style={{ borderColor: color }}>
        <div>
          <h3>{title}</h3>
          <span className="column-count">{tasks.length}</span>
        </div>
        <span className="column-pill" style={{ backgroundColor: color }} />
      </div>
      <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
        <div className="kanban-column-body">
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </div>
      </SortableContext>
    </div>
  )
}
