import { X, ChevronRight, ChevronLeft, Check, MessageSquare, User, Calendar, FileText, Download, Trash2, Activity } from 'lucide-react'
import { useState, useRef, useEffect, useMemo } from 'react'
import { useMissionStore, priorityColors, statusColors, statusOrder } from '../store/useMissionStore'
import MentionText from './MentionText'
import DatePicker from 'react-datepicker'
import { format, isPast, isToday, formatDistanceToNow } from 'date-fns'
import { fetchTaskActivity, addTaskActivity, sendChatMessageToAgent } from '../api'
import 'react-datepicker/dist/react-datepicker.css'

const renderInline = (text) => {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={`b-${index}`}>{part.slice(2, -2)}</strong>
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={`c-${index}`}>{part.slice(1, -1)}</code>
    }
    return <span key={`t-${index}`}>{part}</span>
  })
}

const renderMarkdown = (markdown) => {
  const lines = markdown.split('\n')
  const blocks = []
  let listBuffer = []

  const flushList = (key) => {
    if (listBuffer.length > 0) {
      blocks.push(
        <ul key={`ul-${key}`} className="markdown-list">
          {listBuffer}
        </ul>
      )
      listBuffer = []
    }
  }

  lines.forEach((line, index) => {
    if (!line.trim()) {
      flushList(index)
      blocks.push(<div key={`sp-${index}`} className="markdown-spacer" />)
      return
    }

    if (line.startsWith('### ')) {
      flushList(index)
      blocks.push(
        <h4 key={`h-${index}`} className="markdown-heading">
          {line.replace('### ', '')}
        </h4>
      )
      return
    }

    if (line.startsWith('- ')) {
      listBuffer.push(
        <li key={`li-${index}`} className="markdown-list-item">
          {renderInline(line.replace('- ', ''))}
        </li>
      )
      return
    }

    flushList(index)
    blocks.push(
      <p key={`p-${index}`} className="markdown-paragraph">
        {renderInline(line)}
      </p>
    )
  })

  flushList('end')
  return blocks
}

// File extension to icon mapping
const getFileIcon = (filename) => {
  const ext = filename?.split('.').pop()?.toLowerCase()
  const icons = {
    pdf: '📄',
    doc: '📝',
    docx: '📝',
    xls: '📊',
    xlsx: '📊',
    ppt: '📽️',
    pptx: '📽️',
    png: '🖼️',
    jpg: '🖼️',
    jpeg: '🖼️',
    gif: '🖼️',
    zip: '📦',
    csv: '📊'
  }
  return icons[ext] || '📎'
}

export default function TaskModal() {
  const tasks = useMissionStore((state) => state.tasks)
  const agents = useMissionStore((state) => state.agents)
  const selectedTaskId = useMissionStore((state) => state.selectedTaskId)
  const closeTask = useMissionStore((state) => state.closeTask)
  const moveTaskForward = useMissionStore((state) => state.moveTaskForward)
  const sendTaskBack = useMissionStore((state) => state.sendTaskBack)
  const approveTask = useMissionStore((state) => state.approveTask)
  const setReviewer = useMissionStore((state) => state.setReviewer)
  const updateTaskDueDate = useMissionStore((state) => state.updateTaskDueDate)
  const removeDeliverableAttachment = useMissionStore((state) => state.removeDeliverableAttachment)
  const addComment = useMissionStore((state) => state.addComment)
  const deleteTask = useMissionStore((state) => state.deleteTask)
  
  const [showFeedback, setShowFeedback] = useState(false)
  const [feedback, setFeedback] = useState('')
  // Default to lead agent or first agent
  const leadAgent = agents.find(a => a.role === 'LEAD') || agents[0]
  const [selectedReviewer, setSelectedReviewer] = useState(leadAgent?.id || 'human')
  const [newComment, setNewComment] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const commentInputRef = useRef(null)
  const [activityLog, setActivityLog] = useState([])
  const [activityLoading, setActivityLoading] = useState(false)
  const [previewFile, setPreviewFile] = useState(null)
  const [previewContent, setPreviewContent] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)
  
  // Mention autocomplete state
  const [showMentions, setShowMentions] = useState(false)
  const [mentionFilter, setMentionFilter] = useState('')
  const [mentionIndex, setMentionIndex] = useState(0)
  const [cursorPosition, setCursorPosition] = useState(0)

  // Filter agents based on mention text
  const filteredAgents = useMemo(() => {
    if (!mentionFilter) return agents
    const filter = mentionFilter.toLowerCase()
    return agents.filter(a => 
      a.name.toLowerCase().includes(filter) || 
      a.id.toLowerCase().includes(filter)
    )
  }, [agents, mentionFilter])

  // Reset mention index when filtered list changes
  useEffect(() => {
    setMentionIndex(0)
  }, [filteredAgents.length])

  // Fetch activity log when task changes
  useEffect(() => {
    if (selectedTaskId) {
      setActivityLoading(true)
      fetchTaskActivity(selectedTaskId)
        .then(setActivityLog)
        .catch(console.error)
        .finally(() => setActivityLoading(false))
    } else {
      setActivityLog([])
    }
  }, [selectedTaskId])

  if (!selectedTaskId) return null

  const task = tasks.find((item) => item.id === selectedTaskId)
  const agent = agents.find((item) => item.id === task.assignedTo)
  
  const currentStatusIndex = statusOrder.indexOf(task.status)
  const canMoveForward = currentStatusIndex < statusOrder.length - 1 && task.status !== 'REVIEW'
  const canSendBack = currentStatusIndex > 0 && task.status !== 'DONE'
  const isInReview = task.status === 'REVIEW'
  const isDone = task.status === 'DONE'
  
  const dueDate = task.dueAt ? new Date(task.dueAt) : null
  const isOverdue = dueDate && isPast(dueDate) && !isToday(dueDate) && task.status !== 'DONE'
  
  const handleMoveForward = () => {
    const nextStatus = statusOrder[currentStatusIndex + 1]
    if (nextStatus === 'REVIEW') {
      moveTaskForward(task.id, selectedReviewer)
    } else {
      moveTaskForward(task.id)
    }
  }
  
  const handleSendBack = () => {
    if (feedback.trim()) {
      sendTaskBack(task.id, feedback)
      setFeedback('')
      setShowFeedback(false)
    } else {
      setShowFeedback(true)
    }
  }
  
  const handleApprove = () => {
    approveTask(task.id)
  }
  
  const handleDelete = async () => {
    try {
      await deleteTask(task.id)
      // Task modal will close automatically since selectedTaskId becomes null
    } catch (error) {
      console.error('Failed to delete task:', error)
      setShowDeleteConfirm(false)
    }
  }
  
  const handleDueDateChange = (date) => {
    updateTaskDueDate(task.id, date ? date.toISOString() : null)
  }
  
  const handleRemoveAttachment = (itemId) => {
    removeDeliverableAttachment(task.id, itemId)
  }
  
  const handlePreviewFile = async (attachment) => {
    setPreviewFile(attachment)
    setPreviewLoading(true)
    try {
      const response = await fetch(`/api/files/preview?path=${encodeURIComponent(attachment.path)}`)
      if (response.ok) {
        const text = await response.text()
        setPreviewContent(text)
      } else {
        setPreviewContent('Error loading file preview')
      }
    } catch (error) {
      setPreviewContent('Error loading file preview: ' + error.message)
    }
    setPreviewLoading(false)
  }
  
  const closePreview = () => {
    setPreviewFile(null)
    setPreviewContent('')
  }
  
  const handleAddComment = async () => {
    if (!newComment.trim()) return
    
    const commentText = newComment.trim()
    
    // Clear input immediately for responsive UX
    setNewComment('')
    setShowMentions(false)
    
    // Check for @mentions
    const mentionRegex = /@([\w-]+)/g
    const mentions = []
    let match
    while ((match = mentionRegex.exec(commentText)) !== null) {
      const mentionName = match[1].toLowerCase()
      const mentionedAgent = agents.find(a => 
        a.name.toLowerCase() === mentionName ||
        a.id.toLowerCase() === mentionName ||
        a.name.toLowerCase().replace(/\s+/g, '') === mentionName
      )
      if (mentionedAgent) {
        mentions.push(mentionedAgent)
      }
    }
    
    // Always add to comments (backward compat)
    addComment(task.id, 'user', commentText)
    
    // If there are mentions, also handle activity log and agent routing
    if (mentions.length > 0) {
      const targetAgent = mentions[0] // Route to first mentioned agent
      
      // Optimistically add user comment to activity log immediately
      const optimisticEntry = {
        id: `temp-${Date.now()}`,
        agent_id: 'user',
        agent: { id: 'user', name: 'User', avatar: '👤' },
        message: commentText,
        timestamp: new Date().toISOString()
      }
      setActivityLog(prev => [...prev, optimisticEntry])
      
      // Post user's comment to activity log
      try {
        await addTaskActivity(task.id, 'user', commentText)
        
        // Build full task context for the agent
        const taskContext = `You were mentioned in a task comment.

**Task:** ${task.title}
**Status:** ${task.status}
**Description:** ${task.description || 'No description'}

**Comment from ${task.assignee?.name || 'user'}:**
${commentText}

Please review and respond appropriately. You can reply by adding a comment to this task via the API:
\`\`\`
curl -X POST http://localhost:8000/api/tasks/${task.id}/comments -H "Content-Type: application/json" -d '{"agent_id": "${targetAgent.id}", "content": "Your response here"}'
\`\`\``
        
        // Route to the mentioned agent with full context
        await sendChatMessageToAgent(targetAgent.id, taskContext)
        
        // Refresh activity log to show updates
        fetchTaskActivity(task.id)
          .then(setActivityLog)
          .catch(console.error)
      } catch (error) {
        console.error('Failed to post activity or route to agent:', error)
      }
    }
  }
  
  const insertMention = (agent) => {
    const input = commentInputRef.current
    if (!input) return

    // Find the @ symbol position before cursor
    const textBeforeCursor = newComment.slice(0, cursorPosition)
    const atIndex = textBeforeCursor.lastIndexOf('@')
    
    if (atIndex !== -1) {
      const before = newComment.slice(0, atIndex)
      const after = newComment.slice(cursorPosition)
      const newValue = `${before}@${agent.name} ${after}`
      setNewComment(newValue)
      
      // Set cursor after the mention
      const newCursorPos = atIndex + agent.name.length + 2
      setTimeout(() => {
        input.setSelectionRange(newCursorPos, newCursorPos)
        input.focus()
      }, 0)
    }
    
    setShowMentions(false)
    setMentionFilter('')
  }

  const handleCommentChange = (e) => {
    const value = e.target.value
    const cursor = e.target.selectionStart
    setNewComment(value)
    setCursorPosition(cursor)
    
    // Check if we're typing a mention
    const textBeforeCursor = value.slice(0, cursor)
    const atIndex = textBeforeCursor.lastIndexOf('@')
    
    if (atIndex !== -1) {
      const textAfterAt = textBeforeCursor.slice(atIndex + 1)
      // Only show mentions if @ is at start or after a space, and no space after @
      const charBeforeAt = atIndex > 0 ? value[atIndex - 1] : ' '
      if ((charBeforeAt === ' ' || atIndex === 0) && !textAfterAt.includes(' ')) {
        setShowMentions(true)
        setMentionFilter(textAfterAt)
        return
      }
    }
    
    setShowMentions(false)
    setMentionFilter('')
  }
  
  const handleCommentKeyDown = (e) => {
    if (showMentions && filteredAgents.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setMentionIndex(i => (i + 1) % filteredAgents.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setMentionIndex(i => (i - 1 + filteredAgents.length) % filteredAgents.length)
        return
      }
      if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault()
        insertMention(filteredAgents[mentionIndex])
        return
      }
      if (e.key === 'Escape') {
        setShowMentions(false)
        return
      }
    }
    
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleAddComment()
    }
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={closeTask}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <span className="modal-label">Task Detail</span>
            <h2>{task.title}</h2>
            <div className="modal-badges">
              <span className="status-badge" style={{ backgroundColor: statusColors[task.status] }}>
                {task.status}
              </span>
              {task.priority === 'URGENT' && (
                <span className="priority-badge priority-badge--urgent">
                  🔥 URGENT
                </span>
              )}
              <span className="agent-badge">
                <span className="agent-dot" style={{ backgroundColor: agent?.color }} />
                {agent?.name}
              </span>
            </div>
          </div>
          <button className="icon-button" onClick={closeTask} type="button">
            <X size={18} />
          </button>
        </div>

        <div className="modal-content">
          {/* Due Date Section */}
          <div className="modal-section due-date-section">
            <h3>
              <Calendar size={16} />
              Due Date
            </h3>
            <div className="due-date-picker-container">
              <DatePicker
                selected={dueDate}
                onChange={handleDueDateChange}
                dateFormat="MMM d, yyyy"
                placeholderText="Set due date..."
                className={`due-date-input ${isOverdue ? 'due-date-input--overdue' : ''}`}
                isClearable
                popperPlacement="bottom-start"
              />
              {isOverdue && (
                <span className="overdue-badge">Overdue!</span>
              )}
              {dueDate && isToday(dueDate) && !isDone && (
                <span className="due-today-badge">Due Today</span>
              )}
            </div>
          </div>
          
          <div className="modal-section">
            <h3>Description</h3>
            <div className="markdown">
              {renderMarkdown(task.markdown)}
            </div>
          </div>

          <div className="modal-section">
            <h3>Deliverables</h3>
            <div className="deliverables-list">
              {task.checklist.map((item) => (
                <div key={item.id} className="deliverable-file-item">
                  <div className="file-info">
                    <span className="file-icon">
                      {item.attachment ? getFileIcon(item.attachment.name) : '📄'}
                    </span>
                    {item.attachment ? (
                      <button 
                        className="file-name clickable"
                        onClick={() => handlePreviewFile(item.attachment)}
                        title="Click to preview"
                      >
                        {item.attachment.name}
                      </button>
                    ) : (
                      <span className="file-name no-file">
                        {item.label}
                      </span>
                    )}
                  </div>
                  <div className="file-actions">
                    {item.attachment && (
                      <a 
                        href={`/api/files/preview?path=${encodeURIComponent(item.attachment.path)}`}
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="file-action-btn download-btn"
                        title="Download"
                      >
                        <Download size={14} />
                      </a>
                    )}
                    <button 
                      className="file-action-btn delete-btn"
                      onClick={() => handleRemoveAttachment(item.id)}
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
              
              {task.checklist.length === 0 && (
                <div className="no-deliverables">
                  No deliverables yet.
                </div>
              )}
            </div>
          </div>

          <div className="modal-section">
            <h3>Comments</h3>
            <div className="comment-thread">
              {task.comments.map((comment) => {
                const commentAgent = agents.find((item) => item.id === comment.agentId)
                return (
                  <div key={comment.id} className="comment">
                    <div className="comment-avatar" style={{ backgroundColor: commentAgent?.color }}>
                      {commentAgent?.avatar}
                    </div>
                    <div className="comment-body">
                      <div className="comment-name">{commentAgent?.name}</div>
                      <div className="comment-text">
                        <MentionText text={comment.text} />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            
            {/* Add Comment Input */}
            <div className="add-comment-container">
              {/* Mention autocomplete dropdown */}
              {showMentions && filteredAgents.length > 0 && (
                <div className="mention-dropdown mention-dropdown--comments">
                  {filteredAgents.map((agent, index) => (
                    <button
                      key={agent.id}
                      type="button"
                      className={`mention-option ${index === mentionIndex ? 'selected' : ''}`}
                      onClick={() => insertMention(agent)}
                      onMouseEnter={() => setMentionIndex(index)}
                    >
                      <span 
                        className="mention-avatar" 
                        style={{ backgroundColor: agent.color }}
                      >
                        {agent.avatar}
                      </span>
                      <span className="mention-name">{agent.name}</span>
                      <span className="mention-role">{agent.description}</span>
                    </button>
                  ))}
                  <div className="mention-hint">
                    <kbd>↑↓</kbd> navigate <kbd>Tab</kbd> select <kbd>Esc</kbd> close
                  </div>
                </div>
              )}
              <input
                ref={commentInputRef}
                type="text"
                placeholder="Add a comment... (type @ to mention)"
                value={newComment}
                onChange={handleCommentChange}
                onKeyDown={handleCommentKeyDown}
                className="add-comment-input"
              />
              <button 
                className="add-comment-button"
                onClick={handleAddComment}
                disabled={!newComment.trim()}
              >
                <MessageSquare size={14} />
                Post
              </button>
            </div>
          </div>

          {/* Activity Log Section */}
          <div className="modal-section">
            <h3>
              <Activity size={16} />
              Activity Log
            </h3>
            <div className="activity-log">
              {activityLoading ? (
                <div className="activity-loading">Loading activity...</div>
              ) : activityLog.length === 0 ? (
                <div className="activity-empty">No activity recorded yet</div>
              ) : (
                activityLog.map((entry) => (
                  <div key={entry.id} className="activity-entry">
                    <div className="activity-avatar">
                      {entry.agent?.avatar || '🤖'}
                    </div>
                    <div className="activity-content">
                      <span className="activity-agent">{entry.agent?.name || 'Unknown'}</span>
                      <span className="activity-message">{entry.message}</span>
                    </div>
                    <div className="activity-time">
                      {format(new Date(entry.timestamp), 'MMM d, h:mm a')}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          
          {/* Delete Confirmation */}
          {showDeleteConfirm && (
            <div className="modal-section delete-confirm-section">
              <div className="delete-confirm">
                <span className="delete-confirm-icon">⚠️</span>
                <span className="delete-confirm-text">Delete this task permanently?</span>
                <div className="delete-confirm-actions">
                  <button 
                    type="button"
                    className="action-btn action-btn--secondary"
                    onClick={() => setShowDeleteConfirm(false)}
                  >
                    Cancel
                  </button>
                  <button 
                    type="button"
                    className="action-btn action-btn--danger"
                    onClick={handleDelete}
                  >
                    <Trash2 size={14} />
                    Delete
                  </button>
                </div>
              </div>
            </div>
          )}
          
          {/* Status Actions */}
          {!isDone && (
            <div className="modal-section">
              <h3>Actions</h3>
              
              {/* Reviewer Selection (when moving to REVIEW) */}
              {canMoveForward && statusOrder[currentStatusIndex + 1] === 'REVIEW' && (
                <div className="reviewer-select">
                  <span className="reviewer-label">
                    <User size={14} />
                    Send for review to:
                  </span>
                  <div className="reviewer-options">
                    {agents.map(agent => (
                      <button
                        key={agent.id}
                        type="button"
                        className={`reviewer-btn ${selectedReviewer === agent.id ? 'active' : ''}`}
                        onClick={() => setSelectedReviewer(agent.id)}
                      >
                        {agent.avatar || '🤖'} {agent.name}
                      </button>
                    ))}
                    <button
                      type="button"
                      className={`reviewer-btn ${selectedReviewer === 'human' ? 'active' : ''}`}
                      onClick={() => setSelectedReviewer('human')}
                    >
                      👤 Human
                    </button>
                  </div>
                </div>
              )}
              
              {/* Review Status Badge */}
              {isInReview && task.reviewer && (
                <div className="review-info">
                  <span className="review-badge">
                    {task.reviewer === 'human' ? '👤' : '🤖'} 
                    Awaiting review from <strong>{task.reviewer}</strong>
                  </span>
                </div>
              )}
              
              {/* Feedback Input */}
              {showFeedback && (
                <div className="feedback-input">
                  <textarea
                    placeholder="Add feedback for the assignee..."
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    rows={3}
                  />
                </div>
              )}
              
              <div className="action-buttons">
                {/* Send Back Button */}
                {canSendBack && (
                  <button
                    type="button"
                    className="action-btn action-btn--secondary"
                    onClick={handleSendBack}
                  >
                    <ChevronLeft size={16} />
                    {showFeedback ? 'Submit Feedback' : 'Request Changes'}
                  </button>
                )}
                
                {/* Review Actions */}
                {isInReview ? (
                  <button
                    type="button"
                    className="action-btn action-btn--approve"
                    onClick={handleApprove}
                  >
                    <Check size={16} />
                    Approve
                  </button>
                ) : canMoveForward ? (
                  <button
                    type="button"
                    className="action-btn action-btn--primary"
                    onClick={handleMoveForward}
                  >
                    {statusOrder[currentStatusIndex + 1] === 'REVIEW' ? 'Send for Review' : 'Move Forward'}
                    <ChevronRight size={16} />
                  </button>
                ) : null}
                
                {/* Delete Button */}
                {!showDeleteConfirm && (
                  <button
                    type="button"
                    className="action-btn action-btn--delete"
                    onClick={() => setShowDeleteConfirm(true)}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          )}
          
          {/* Delete button for completed tasks */}
          {isDone && !showDeleteConfirm && (
            <div className="modal-section">
              <div className="action-buttons">
                <button
                  type="button"
                  className="action-btn action-btn--delete"
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  <Trash2 size={14} />
                  Delete Task
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* File Preview Modal */}
      {previewFile && (
        <div className="preview-overlay" onClick={closePreview}>
          <div className="preview-modal" onClick={(e) => e.stopPropagation()}>
            <div className="preview-header">
              <h3>{previewFile.name}</h3>
              <button className="preview-close" onClick={closePreview}>
                <X size={20} />
              </button>
            </div>
            <div className="preview-content">
              {previewLoading ? (
                <div className="preview-loading">Loading...</div>
              ) : (
                <pre className="preview-text">{previewContent}</pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
