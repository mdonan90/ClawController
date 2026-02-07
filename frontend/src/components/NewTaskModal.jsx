import { useState } from 'react'
import { X, Plus, Sparkles, Calendar, RefreshCw, Clock } from 'lucide-react'
import { useMissionStore } from '../store/useMissionStore'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'

const DAYS_OF_WEEK = [
  { value: 0, label: 'Mon' },
  { value: 1, label: 'Tue' },
  { value: 2, label: 'Wed' },
  { value: 3, label: 'Thu' },
  { value: 4, label: 'Fri' },
  { value: 5, label: 'Sat' },
  { value: 6, label: 'Sun' },
]

export default function NewTaskModal() {
  const isOpen = useMissionStore((state) => state.isNewTaskOpen)
  const closeNewTask = useMissionStore((state) => state.closeNewTask)
  const createTask = useMissionStore((state) => state.createTask)
  const createRecurringTask = useMissionStore((state) => state.createRecurringTask)
  const agents = useMissionStore((state) => state.agents)
  const loadingTasks = useMissionStore((state) => state.loadingTasks)
  const loadingRecurring = useMissionStore((state) => state.loadingRecurring)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('Normal')
  const [assignedTo, setAssignedTo] = useState('main')
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState([])
  const [dueDate, setDueDate] = useState(null)
  const [error, setError] = useState(null)
  
  // Recurring task state
  const [isRecurring, setIsRecurring] = useState(false)
  const [scheduleType, setScheduleType] = useState('daily')
  const [scheduleTime, setScheduleTime] = useState('09:00')
  const [selectedDays, setSelectedDays] = useState([0, 1, 2, 3, 4]) // Mon-Fri by default
  const [hourlyInterval, setHourlyInterval] = useState(1)
  const [cronExpression, setCronExpression] = useState('')
  
  const isLoading = loadingTasks || loadingRecurring

  if (!isOpen) return null

  const handleAddTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()])
      setTagInput('')
    }
  }

  const handleRemoveTag = (tagToRemove) => {
    setTags(tags.filter(t => t !== tagToRemove))
  }

  const handleTagKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAddTag()
    }
  }

  const toggleDay = (dayValue) => {
    if (selectedDays.includes(dayValue)) {
      setSelectedDays(selectedDays.filter(d => d !== dayValue))
    } else {
      setSelectedDays([...selectedDays, dayValue].sort())
    }
  }
  
  const getScheduleValue = () => {
    switch (scheduleType) {
      case 'weekly':
        return selectedDays.join(',')
      case 'hourly':
        return String(hourlyInterval)
      case 'cron':
        return cronExpression
      default:
        return null
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!title.trim()) return

    setError(null)
    
    try {
      if (isRecurring) {
        // Create recurring task
        await createRecurringTask({
          title: title.trim(),
          description: description.trim(),
          priority,
          assignedTo,
          tags,
          scheduleType,
          scheduleValue: getScheduleValue(),
          scheduleTime: scheduleType !== 'hourly' ? scheduleTime : null,
        })
      } else {
        // Create regular task
        await createTask({
          title: title.trim(),
          description: description.trim(),
          priority,
          assignedTo,
          tags,
          dueAt: dueDate ? dueDate.toISOString() : null
        })
      }

      // Reset form on success
      setTitle('')
      setDescription('')
      setPriority('Normal')
      setAssignedTo('main')
      setTags([])
      setTagInput('')
      setDueDate(null)
      setIsRecurring(false)
      setScheduleType('daily')
      setScheduleTime('09:00')
      setSelectedDays([0, 1, 2, 3, 4])
      setHourlyInterval(1)
      setCronExpression('')
    } catch (err) {
      setError(isRecurring ? 'Failed to create recurring task.' : 'Failed to create task. Please try again.')
    }
  }

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      closeNewTask()
    }
  }

  const handleClose = () => {
    setError(null)
    closeNewTask()
  }

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal new-task-modal">
        <div className="modal-header">
          <div>
            <span className="modal-label">Create Task</span>
            <h2>
              <Sparkles size={20} style={{ marginRight: 8, color: 'var(--accent)' }} />
              New Mission
            </h2>
          </div>
          <button type="button" className="icon-button" onClick={handleClose} disabled={isLoading}>
            <X size={18} />
          </button>
        </div>

        <form className="modal-content" onSubmit={handleSubmit}>
          <div className="field">
            <label>Title</label>
            <input
              type="text"
              placeholder="What needs to be done?"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              required
              disabled={isLoading}
            />
          </div>

          <div className="field">
            <label>Description</label>
            <textarea
              placeholder="Add details, context, or instructions..."
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isLoading}
            />
          </div>

          <div className="field-row">
            <div className="field">
              <label>Priority</label>
              <div className="priority-options">
                <button
                  type="button"
                  className={`priority-chip ${priority === 'Normal' ? 'active' : ''}`}
                  onClick={() => setPriority('Normal')}
                  disabled={isLoading}
                >
                  Normal
                </button>
                <button
                  type="button"
                  className={`priority-chip priority-chip--urgent ${priority === 'Urgent' ? 'active' : ''}`}
                  onClick={() => setPriority('Urgent')}
                  disabled={isLoading}
                >
                  🔴 Urgent
                </button>
              </div>
            </div>

            <div className="field">
              <label>
                <Calendar size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                Due Date
              </label>
              <DatePicker
                selected={dueDate}
                onChange={(date) => setDueDate(date)}
                dateFormat="MMM d, yyyy"
                placeholderText="Select due date..."
                className="due-date-input"
                isClearable
                minDate={new Date()}
                popperPlacement="bottom-start"
                disabled={isLoading}
              />
            </div>
          </div>

          <div className="field">
            <label>Assign To</label>
            <div className="agent-select-grid">
              {agents.map((agent) => (
                <button
                  key={agent.id}
                  type="button"
                  className={`agent-select-chip ${assignedTo === agent.id ? 'active' : ''}`}
                  onClick={() => setAssignedTo(agent.id)}
                  style={assignedTo === agent.id ? { 
                    borderColor: agent.color,
                    backgroundColor: `${agent.color}15`
                  } : undefined}
                  disabled={isLoading}
                >
                  <span className="agent-select-avatar" style={{ backgroundColor: agent.color }}>
                    {agent.avatar}
                  </span>
                  <span>{agent.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label>Tags</label>
            <div className="tag-input-container">
              <input
                type="text"
                placeholder="Add a tag and press Enter"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                disabled={isLoading}
              />
              <button type="button" className="icon-button" onClick={handleAddTag} disabled={isLoading}>
                <Plus size={16} />
              </button>
            </div>
            {tags.length > 0 && (
              <div className="tags-preview">
                {tags.map((tag) => (
                  <span key={tag} className="tag tag--removable" onClick={() => !isLoading && handleRemoveTag(tag)}>
                    {tag} ×
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Recurring Task Toggle */}
          <div className="field recurring-toggle-field">
            <label className="recurring-toggle-label">
              <div className="toggle-switch-container">
                <input
                  type="checkbox"
                  checked={isRecurring}
                  onChange={(e) => setIsRecurring(e.target.checked)}
                  disabled={isLoading}
                  className="toggle-checkbox"
                />
                <span className="toggle-switch" />
              </div>
              <RefreshCw size={16} className={isRecurring ? 'recurring-icon active' : 'recurring-icon'} />
              <span>Make Recurring</span>
            </label>
          </div>

          {/* Recurring Schedule Options */}
          {isRecurring && (
            <div className="recurring-options">
              <div className="field">
                <label>Frequency</label>
                <select
                  value={scheduleType}
                  onChange={(e) => setScheduleType(e.target.value)}
                  disabled={isLoading}
                  className="schedule-select"
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="hourly">Every X hours</option>
                  <option value="cron">Custom cron</option>
                </select>
              </div>
              
              {/* Time picker for daily/weekly */}
              {(scheduleType === 'daily' || scheduleType === 'weekly') && (
                <div className="field">
                  <label>
                    <Clock size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                    Time
                  </label>
                  <input
                    type="time"
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    disabled={isLoading}
                    className="time-input"
                  />
                </div>
              )}
              
              {/* Day picker for weekly */}
              {scheduleType === 'weekly' && (
                <div className="field">
                  <label>Days of Week</label>
                  <div className="days-picker">
                    {DAYS_OF_WEEK.map((day) => (
                      <button
                        key={day.value}
                        type="button"
                        className={`day-chip ${selectedDays.includes(day.value) ? 'active' : ''}`}
                        onClick={() => toggleDay(day.value)}
                        disabled={isLoading}
                      >
                        {day.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Hours interval for hourly */}
              {scheduleType === 'hourly' && (
                <div className="field">
                  <label>Run every</label>
                  <div className="hourly-input">
                    <input
                      type="number"
                      min="1"
                      max="24"
                      value={hourlyInterval}
                      onChange={(e) => setHourlyInterval(parseInt(e.target.value) || 1)}
                      disabled={isLoading}
                    />
                    <span>hours</span>
                  </div>
                </div>
              )}
              
              {/* Cron expression input */}
              {scheduleType === 'cron' && (
                <div className="field">
                  <label>Cron Expression</label>
                  <input
                    type="text"
                    placeholder="0 9 * * 1-5"
                    value={cronExpression}
                    onChange={(e) => setCronExpression(e.target.value)}
                    disabled={isLoading}
                    className="cron-input"
                  />
                  <span className="field-hint">e.g., "0 9 * * 1-5" = 9 AM weekdays</span>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="error-message" style={{ color: '#dc2626', fontSize: 13, marginBottom: 12 }}>
              {error}
            </div>
          )}

          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={handleClose} disabled={isLoading}>
              Cancel
            </button>
            <button 
              type="submit" 
              className={`primary-button ${isLoading ? 'button-loading' : ''}`}
              disabled={!title.trim() || loadingTasks}
            >
              <Plus size={16} />
              {isLoading ? 'Creating...' : (isRecurring ? 'Create Recurring Task' : 'Create Task')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
