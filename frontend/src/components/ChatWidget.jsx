import { useState, useRef, useEffect, useMemo } from 'react'
import { MessageCircle, Send, X } from 'lucide-react'
import { useMissionStore } from '../store/useMissionStore'
import MentionText from './MentionText'

export default function ChatWidget() {
  const isChatOpen = useMissionStore((state) => state.isChatOpen)
  const toggleChat = useMissionStore((state) => state.toggleChat)
  const messages = useMissionStore((state) => state.squadMessages)
  const agents = useMissionStore((state) => state.agents)
  const addChatMessage = useMissionStore((state) => state.addChatMessage)
  const loadingChat = useMissionStore((state) => state.loadingChat)
  const wsConnected = useMissionStore((state) => state.wsConnected)
  const unreadChatCount = useMissionStore((state) => state.unreadChatCount)
  
  const [inputValue, setInputValue] = useState('')
  const [error, setError] = useState(null)
  const [showMentions, setShowMentions] = useState(false)
  const [mentionFilter, setMentionFilter] = useState('')
  const [mentionIndex, setMentionIndex] = useState(0)
  const [cursorPosition, setCursorPosition] = useState(0)
  
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  // Filter agents based on mention text
  const filteredAgents = useMemo(() => {
    if (!mentionFilter) return agents
    const filter = mentionFilter.toLowerCase()
    return agents.filter(a => 
      a.name.toLowerCase().includes(filter) || 
      a.id.toLowerCase().includes(filter)
    )
  }, [agents, mentionFilter])

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (isChatOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isChatOpen])

  // Reset mention index when filtered list changes
  useEffect(() => {
    setMentionIndex(0)
  }, [filteredAgents.length])

  const handleSend = async () => {
    if (!inputValue.trim() || loadingChat) return
    
    const messageText = inputValue.trim()
    setInputValue('')
    setError(null)
    setShowMentions(false)
    
    try {
      await addChatMessage(messageText)
    } catch (err) {
      setError('Failed to send message')
      setInputValue(messageText)
    }
  }

  const insertMention = (agent) => {
    const input = inputRef.current
    if (!input) return

    // Find the @ symbol position before cursor
    const textBeforeCursor = inputValue.slice(0, cursorPosition)
    const atIndex = textBeforeCursor.lastIndexOf('@')
    
    if (atIndex !== -1) {
      const before = inputValue.slice(0, atIndex)
      const after = inputValue.slice(cursorPosition)
      const newValue = `${before}@${agent.name} ${after}`
      setInputValue(newValue)
      
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

  const handleInputChange = (e) => {
    const value = e.target.value
    const cursor = e.target.selectionStart
    setInputValue(value)
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

  const handleKeyDown = (e) => {
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
      handleSend()
    }
  }

  // Get agent by ID with fallback
  const getAgent = (agentId) => {
    // Handle user messages specially
    if (agentId === 'user' || agentId === null || agentId === undefined) {
      return { id: 'user', name: 'User', avatar: '👤', color: '#6B7280' }
    }
    const agent = agents.find((item) => item.id === agentId)
    if (agent) return agent
    if (agentId === 'main') {
      return { id: 'main', name: 'Jarvis', avatar: '🤖', color: '#F97316' }
    }
    return { id: agentId, name: agentId, avatar: '🤖', color: '#6B7280' }
  }

  return (
    <>
      {/* Slide-out chat panel */}
      <div className={`chat-slide-panel ${isChatOpen ? 'open' : ''}`}>
        <div className="chat-panel-header">
          <div className="chat-panel-title">
            <MessageCircle size={18} />
            <div>
              <h4>Agent Chat</h4>
              <span>
                {wsConnected ? 'Type @ to mention agents' : 'Connecting...'}
              </span>
            </div>
          </div>
          <button type="button" className="chat-close-button" onClick={toggleChat}>
            <X size={18} />
          </button>
        </div>
        
        <div className="chat-messages-container">
          {messages.length === 0 ? (
            <div className="chat-empty">
              <MessageCircle size={32} style={{ opacity: 0.3 }} />
              <p>No messages yet</p>
              <span>Start the conversation!</span>
            </div>
          ) : (
            messages.map((message) => {
              const agent = message.agent || getAgent(message.agentId)
              return (
                <div key={message.id} className={`chat-message ${message.isTyping ? 'chat-message--typing' : ''}`}>
                  <div className="chat-avatar" style={{ backgroundColor: agent?.color }}>
                    {agent?.avatar}
                  </div>
                  <div className="chat-body">
                    <div className="chat-message-header">
                      <span className="chat-name">{agent?.name}</span>
                      <span className="chat-time">{message.timestamp}</span>
                    </div>
                    <div className="chat-text">
                      {message.isTyping ? (
                        <span className="typing-indicator">
                          <span className="typing-dot"></span>
                          <span className="typing-dot"></span>
                          <span className="typing-dot"></span>
                        </span>
                      ) : (
                        <MentionText text={message.text || message.content} />
                      )}
                    </div>
                  </div>
                </div>
              )
            })
          )}
          <div ref={messagesEndRef} />
        </div>
        
        {error && (
          <div className="chat-error" style={{ 
            padding: '8px 16px', 
            background: 'rgba(220, 38, 38, 0.1)', 
            color: '#dc2626',
            fontSize: 12 
          }}>
            {error}
          </div>
        )}
        
        <div className="chat-input-wrapper">
          {/* Mention autocomplete dropdown */}
          {showMentions && filteredAgents.length > 0 && (
            <div className="mention-dropdown">
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
          
          <div className="chat-input-container">
            <input 
              ref={inputRef}
              type="text" 
              placeholder={loadingChat ? 'Sending...' : 'Message or @mention an agent...'} 
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              disabled={loadingChat}
            />
            <button 
              type="button" 
              className={`chat-send-button ${loadingChat ? 'button-loading' : ''}`}
              onClick={handleSend}
              disabled={!inputValue.trim() || loadingChat}
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>
      
      {/* Floating toggle button */}
      <button 
        className={`chat-fab ${isChatOpen ? 'hidden' : ''}`} 
        type="button" 
        onClick={toggleChat}
      >
        <MessageCircle size={20} />
        <span>Agent Chat</span>
        {unreadChatCount > 0 && (
          <span className="chat-badge">{unreadChatCount}</span>
        )}
      </button>
    </>
  )
}
