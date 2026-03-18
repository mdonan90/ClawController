import { X, ChevronRight, ChevronLeft, Check, MessageSquare, User, Calendar, Paperclip, FileText, Download, Trash2, Activity, Radio } from 'lucide-react'
import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
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
  const toggleChecklistItem = useMissionStore((state) => state.toggleChecklistItem)
  const addDeliverable = useMissionStore((state) => state.addDeliverable)
  const addDeliverableAttachment = useMissionStore((state) => state.addDeliverableAttachment)
  const removeDeliverableAttachment = useMissionStore((state) => state.removeDeliverableAttachment)
  const addComment = useMissionStore((state) => state.addComment)
  const deleteTask = useMissionStore((state) => state.deleteTask)
  
  const [showFeedback, setShowFeedback] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [newDeliverableTitle, setNewDeliverableTitle] = useState('')
  // Default to lead agent or first agent
  const leadAgent = agents.find(a => a.role === 'LEAD') || agents[0]
  const [selectedReviewer, setSelectedReviewer] = useState(leadAgent?.id || 'human')
  const [newComment, setNewComment] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [activeTab, setActiveTab] = useState('activity') // 'activity' | 'live'
  const [liveEvents, setLiveEvents] = useState([])
  const [liveStatus, setLiveStatus] = useState('idle') // 'idle' | 'connecting' | 'connected' | 'error'
  const liveScrollRef = useRef(null)
  const wsRef = useRef(null)
  const fileInputRef = useRef(null)
  const commentInputRef = useRef(null)
  const [uploadingForItem, setUploadingForItem] = useState(null)

  // Live stream WebSocket
  const connectLiveStream = useCallback(() => {
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null }
    setLiveEvents([])
    setLiveStatus('connecting')
    const wsUrl = `ws://${window.location.hostname}:8000/ws/tasks/${selectedTaskId}/stream`
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws
    ws.onopen = () => setLiveStatus('connecting')
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'connected') { setLiveStatus('connected') }
        else if (data.type === 'error') { setLiveStatus('error') }
        else if (data.type === 'waiting') { /* still connecting */ }
        else {
          setLiveEvents(prev => [...prev.slice(-200), data])
        }
      } catch {}
    }
    ws.onerror = () => setLiveStatus('error')
    ws.onclose = () => { if (liveStatus !== 'error') setLiveStatus('idle') }
  }, [selectedTaskId])

  // Auto-scroll live events
  useEffect(() => {
    if (liveScrollRef.current) {
      liveScrollRef.current.scrollTop = liveScrollRef.current.scrollHeight
    }
  }, [liveEvents])

  // Cleanup WebSocket on unmount or tab switch
  useEffect(() => {
    return () => { if (wsRef.current) { wsRef.current.close(); wsRef.current = null } }
  }, [])

  // Connect when switching to live tab
  useEffect(() => {
    if (activeTab === 'live' && selectedTaskId) {
      connectLiveStream()
    } else if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
  }, [activeTab, selectedTaskId, connectLiveStream])
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
  
  const handleFileUpload = (itemId) => {
    setUploadingForItem(itemId)
    fileInputRef.current?.click()
  }
  
  const handleFileSelected = (e) => {
    const file = e.target.files?.[0]
    if (file && uploadingForItem) {
      // Mock upload - in real implementation, upload to server
      const attachment = {
        name: file.name,
        path: `/uploads/${file.name}`,
        size: file.size,
        type: file.type
      }
      addDeliverableAttachment(task.id, uploadingForItem, attachment)
      setUploadingForItem(null)
    }
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
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
            <div className="checklist">
              {task.checklist.map((item) => (
                <div key={item.id} className="deliverable-item">
                  <label className={`check-item ${item.done ? 'done' : ''}`}>
                    <input 
                      type="checkbox" 
                      checked={item.done} 
                      onChange={() => toggleChecklistItem(task.id, item.id)}
                    />
                    <span>{item.label}</span>
                  </label>
                  <div className="deliverable-actions">
                    {item.attachment ? (
                      <div className="attachment-badge">
                        <span className="attachment-icon">{getFileIcon(item.attachment.name)}</span>
                        <button 
                          className="attachment-name clickable"
                          onClick={() => handlePreviewFile(item.attachment)}
                          title="Click to preview"
                        >
                          {item.attachment.name}
                        </button>
                        <a 
                          href={`/api/files/preview?path=${encodeURIComponent(item.attachment.path)}`}
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="attachment-download"
                          title="Download"
                        >
                          <Download size={12} />
                        </a>
                        <button 
                          className="attachment-remove"
                          onClick={() => handleRemoveAttachment(item.id)}
                          title="Remove"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ) : (
                      <button 
                        className="attach-button"
                        onClick={() => handleFileUpload(item.id)}
                        title="Attach file"
                      >
                        <Paperclip size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              
              {/* Add new deliverable */}
              <div className="add-deliverable">
                <input
                  type="text"
                  placeholder="Add deliverable..."
                  value={newDeliverableTitle}
                  onChange={(e) => setNewDeliverableTitle(e.target.value)}
                  onKeyPress={async (e) => {
                    if (e.key === 'Enter' && newDeliverableTitle.trim()) {
                      try {
                        await addDeliverable(task.id, newDeliverableTitle.trim())
                        setNewDeliverableTitle('')
                      } catch (error) {
                        console.error('Failed to add deliverable:', error)
                      }
                    }
                  }}
                  className="deliverable-input"
                />
              </div>
            </div>
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: 'none' }}
              onChange={handleFileSelected}
            />
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

          {/* Activity / Live Tabs */}
          <div className="modal-section">
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              <button
                onClick={() => setActiveTab('activity')}
                style={{
                  display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 12px',
                  borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 500,
                  background: activeTab === 'activity' ? 'var(--accent)' : 'var(--surface-2, #2a2a3a)',
                  color: activeTab === 'activity' ? '#fff' : 'var(--text-secondary)',
                }}
              >
                <Activity size={14} /> Activity Log
              </button>
              <button
                onClick={() => setActiveTab('live')}
                style={{
                  display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 12px',
                  borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 500,
                  background: activeTab === 'live' ? '#ef4444' : 'var(--surface-2, #2a2a3a)',
                  color: activeTab === 'live' ? '#fff' : 'var(--text-secondary)',
                }}
              >
                <Radio size={14} /> Live
                {liveStatus === 'connected' && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', marginLeft: 4 }} />}
              </button>
            </div>

            {activeTab === 'activity' && (
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
                        {format(new Date(entry.timestamp?.endsWith('Z') ? entry.timestamp : entry.timestamp + 'Z'), 'MMM d, h:mm a')}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === 'live' && (
              <div style={{ background: '#0d1117', borderRadius: '8px', padding: '12px', maxHeight: '400px', overflow: 'auto', fontFamily: 'monospace', fontSize: '12px' }} ref={liveScrollRef}>
                {liveStatus === 'connecting' && <div style={{ color: '#f59e0b' }}>⏳ Connecting to agent session...</div>}
                {liveStatus === 'error' && <div style={{ color: '#ef4444' }}>❌ Could not connect to session. <button onClick={connectLiveStream} style={{ color: '#60a5fa', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Retry</button></div>}
                {liveStatus === 'idle' && liveEvents.length === 0 && <div style={{ color: '#6b7280' }}>Click to connect to agent&apos;s live session</div>}
                {liveEvents.map((evt, i) => (
                  <div key={i} style={{ marginBottom: '4px', opacity: evt.backfill ? 0.5 : 1 }}>
                    {evt.type === 'text' && (
                      <div style={{ color: evt.role === 'assistant' ? '#a78bfa' : '#9ca3af' }}>
                        <span style={{ color: '#6b7280', marginRight: 6 }}>{evt.role === 'assistant' ? '🤖' : '📥'}</span>
                        {evt.content?.substring(0, 500)}
                      </div>
                    )}
                    {evt.type === 'thinking' && (
                      <div style={{ color: '#6b7280', fontStyle: 'italic' }}>
                        💭 {evt.content?.substring(0, 200)}
                      </div>
                    )}
                    {evt.type === 'tool' && (
                      <div style={{ color: '#22d3ee' }}>
                        🔧 <strong>{evt.name}</strong> → {evt.detail}
                      </div>
                    )}
                    {evt.type === 'result' && (
                      <div style={{ color: '#4ade80', paddingLeft: 20 }}>
                        ↪ {evt.content?.substring(0, 300)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
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
