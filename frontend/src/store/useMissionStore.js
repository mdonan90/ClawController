import { create } from 'zustand'
import * as api from '../api'

// Parse @mentions from text and return array of agent IDs mentioned
const parseMentions = (text, agents) => {
  const mentionRegex = /@([\w-]+)/g
  const mentions = []
  let match
  while ((match = mentionRegex.exec(text)) !== null) {
    const mentionName = match[1]
    const agent = agents.find(a => 
      a.name.toLowerCase() === mentionName.toLowerCase() ||
      a.name.toLowerCase().replace('-', '') === mentionName.toLowerCase()
    )
    if (agent) {
      mentions.push(agent.id)
    }
  }
  return mentions
}

// Check if a message mentions the user (for unread tracking)
const mentionsUser = (text) => {
  if (!text) return false
  const lowerText = text.toLowerCase()
  // Check for common user mentions
  return lowerText.includes('@user') || 
         lowerText.includes('@mike') || 
         lowerText.includes('@human') ||
         lowerText.includes('@boss')
}

// Transform API agent to frontend format
const transformAgent = (apiAgent) => ({
  id: apiAgent.id,
  name: apiAgent.name,
  role: apiAgent.role,
  roleLabel: getRoleLabel(apiAgent.role),
  status: apiAgent.status,
  avatar: apiAgent.avatar || '🤖',
  color: getAgentColor(apiAgent.id, apiAgent.name),
  description: apiAgent.description || '',
  emoji: apiAgent.emoji || apiAgent.avatar || '🤖',
  model: apiAgent.model || null,
  workspace: apiAgent.workspace || null,
})

// Transform API task to frontend format
const transformTask = (apiTask) => ({
  id: apiTask.id,
  title: apiTask.title,
  description: apiTask.description || '',
  status: apiTask.status === 'IN_PROGRESS' ? 'IN PROGRESS' : apiTask.status,
  tags: apiTask.tags || [],
  priority: apiTask.priority === 'URGENT' ? 'Urgent' : 'Normal',
  assignedTo: apiTask.assignee_id,
  assignee: apiTask.assignee,
  reviewer: apiTask.reviewer,
  timestamp: formatTime(apiTask.created_at),
  dueAt: apiTask.due_at,
  createdAt: apiTask.created_at,
  updatedAt: apiTask.updated_at,
  checklist: apiTask.deliverables?.map(d => ({
    id: d.id,
    label: d.title,
    done: d.completed,
    attachment: null, // Backend doesn't track attachments yet
  })) || [],
  comments: apiTask.comments?.map(c => ({
    id: c.id,
    agentId: c.agent_id,
    text: c.content,
    timestamp: formatTime(c.created_at),
  })) || [],
  commentsCount: apiTask.comments_count || 0,
  deliverablesCount: apiTask.deliverables_count || 0,
  deliverablesComplete: apiTask.deliverables_complete || 0,
  markdown: apiTask.description || '',
  completedAt: apiTask.status === 'DONE' ? apiTask.updated_at : null,
})

// Transform API chat message to frontend format
const transformChatMessage = (apiMessage) => ({
  id: apiMessage.id,
  agentId: apiMessage.agent_id,
  text: apiMessage.content,
  timestamp: formatTime(apiMessage.created_at),
  agent: apiMessage.agent,
})

// Transform API activity to frontend format
const transformActivity = (apiActivity) => ({
  id: apiActivity.id,
  type: mapActivityType(apiActivity.activity_type),
  title: getActivityTitle(apiActivity.activity_type),
  detail: apiActivity.description,
  agentId: apiActivity.agent?.id,
  agent: apiActivity.agent,
  taskId: apiActivity.task_id,
  timestamp: formatRelativeTime(apiActivity.created_at),
})

// Helper functions
function getRoleLabel(role) {
  const labels = { LEAD: 'Lead', INT: '', SPC: '' }
  return labels[role] || role
}

function getAgentColor(id, name) {
  const colors = {
    main: '#E07B3C',
    jarvis: '#E07B3C',
    dev: '#3B82F6',
    trader: '#16A34A',
    leadgen: '#A855F7',
    sales: '#F59E0B',
    rodel: '#0EA5E9',
  }
  return colors[id] || colors[name?.toLowerCase()] || '#6B7280'
}

function formatTime(isoString) {
  if (!isoString) return ''
  const date = new Date(isoString)
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}

function formatRelativeTime(isoString) {
  if (!isoString) return ''
  const date = new Date(isoString)
  const now = new Date()
  const diffMs = now - date
  const diffMins = Math.floor(diffMs / 60000)
  
  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d ago`
}

function mapActivityType(type) {
  const map = {
    task_created: 'task',
    task_approved: 'status',
    task_rejected: 'status',
    status_changed: 'status',
    comment_added: 'comment',
    deliverable_complete: 'status',
    sent_to_review: 'status',
    announcement: 'announcement',
  }
  return map[type] || 'task'
}

function getActivityTitle(type) {
  const titles = {
    task_created: 'New task created',
    task_approved: 'Task approved',
    task_rejected: 'Task sent back',
    status_changed: 'Status updated',
    comment_added: 'Comment added',
    deliverable_complete: 'Deliverable completed',
    sent_to_review: 'Sent for review',
    announcement: 'Announcement',
  }
  return titles[type] || 'Activity'
}

export const useMissionStore = create((set, get) => ({
  // Data
  agents: [],
  tasks: [],
  recurringTasks: [],
  liveFeed: [],
  squadMessages: [],
  unreadChatCount: 0, // Count of unread agent messages that mention user
  notifications: [],
  historicalStats: {},
  stats: null,
  
  // Agent Management
  availableModels: [],
  
  // Loading states
  isLoading: true,
  isInitialized: false,
  loadingTasks: false,
  loadingChat: false,
  loadingRecurring: false,
  loadingAgentManagement: false,
  error: null,
  useOpenClaw: false,
  
  // WebSocket
  wsConnected: false,
  ws: null,
  
  // UI state
  selectedTaskId: null,
  isChatOpen: false,
  isAnnouncementOpen: false,
  isNewTaskOpen: false,
  isRecurringPanelOpen: false,
  isNotificationsOpen: false,
  isAgentManagementOpen: false,
  isAddAgentWizardOpen: false,
  editingAgentId: null,
  selectedAgentId: null,
  selectedRecurringTaskId: null,
  currentAgentId: 'main', // The "logged in" agent
  
  // ============ Initialization ============
  initialize: async () => {
    try {
      set({ isLoading: true, error: null })
      
      // Fetch all initial data in parallel
      // Try OpenClaw agents first for real-time status
      const [agentsData, tasksData, chatData, activityData, recurringData] = await Promise.all([
        api.fetchAgentsWithOpenClaw(),
        api.fetchTasks(),
        api.fetchChatMessages(),
        api.fetchActivity(),
        api.fetchRecurringTasks().catch(() => []), // Don't fail if recurring endpoint doesn't exist yet
      ])
      
      set({
        agents: agentsData.map(transformAgent),
        tasks: tasksData.map(transformTask),
        recurringTasks: recurringData,
        squadMessages: chatData.map(transformChatMessage),
        liveFeed: activityData.map(transformActivity),
        isLoading: false,
        isInitialized: true,
        useOpenClaw: true,
      })
      
      console.log('ClawController initialized with OpenClaw agent data')
    } catch (error) {
      console.error('Failed to initialize:', error)
      set({ 
        isLoading: false, 
        error: error.message || 'Failed to load data',
      })
    }
  },
  
  // Refresh agents from OpenClaw for real-time status
  refreshAgents: async () => {
    try {
      const agentsData = await api.fetchAgentsWithOpenClaw()
      set({ agents: agentsData.map(transformAgent) })
    } catch (error) {
      console.error('Failed to refresh agents:', error)
    }
  },
  
  // ============ WebSocket ============
  connectWebSocket: () => {
    const ws = api.createWebSocket(
      // onMessage
      (data) => {
        const state = get()
        
        switch (data.type) {
          case 'task_created':
            // Refetch tasks to get the new task with full data
            state.refreshTasks()
            state.addFeedItem({
              type: 'task',
              title: 'New task created',
              detail: data.data.title,
              taskId: data.data.id,
            })
            break
            
          case 'task_updated':
          case 'task_reviewed':
            state.refreshTasks()
            break
            
          case 'task_deleted':
            set(s => ({
              tasks: s.tasks.filter(t => t.id !== data.data.id)
            }))
            break
            
          case 'chat_message':
            {
              const msg = data.data
              const isFromAgent = msg.agent_id && msg.agent_id !== 'user'
              const msgMentionsUser = mentionsUser(msg.content)
              const chatOpen = get().isChatOpen
              
              const transformed = transformChatMessage(msg)
              
              set(s => {
                // Check if message already exists (from optimistic update)
                const exists = s.squadMessages.some(m => m.id === transformed.id)
                if (exists) {
                  return s // No change - already added via optimistic update
                }
                
                return {
                  squadMessages: [...s.squadMessages, transformed],
                  // Only increment unread if: from agent, mentions user, and chat is closed
                  unreadChatCount: (isFromAgent && msgMentionsUser && !chatOpen) 
                    ? s.unreadChatCount + 1 
                    : s.unreadChatCount
                }
              })
            }
            break
            
          case 'announcement':
            state.addFeedItem({
              type: 'announcement',
              title: 'Announcement',
              detail: data.data.message,
            })
            // Could also show a toast notification here
            break
            
          case 'comment_added':
            state.refreshTasks()
            break
            
          case 'activity':
            state.addFeedItem({
              type: mapActivityType(data.data.activity_type),
              title: getActivityTitle(data.data.activity_type),
              detail: data.data.description,
              agentId: data.data.agent_id,
              taskId: data.data.task_id,
            })
            break
            
          case 'agent_status':
            set(s => ({
              agents: s.agents.map(a => 
                a.id === data.data.id ? { ...a, status: data.data.status } : a
              )
            }))
            break
            
          case 'recurring_created':
          case 'recurring_updated':
          case 'recurring_deleted':
          case 'recurring_run':
            state.refreshRecurringTasks()
            break
        }
      },
      // onOpen
      () => set({ wsConnected: true }),
      // onClose
      () => {
        set({ wsConnected: false })
        // Attempt to reconnect after 3 seconds
        setTimeout(() => {
          const state = get()
          if (!state.wsConnected) {
            state.connectWebSocket()
          }
        }, 3000)
      },
      // onError
      (error) => console.error('WebSocket error:', error)
    )
    
    set({ ws })
  },
  
  disconnectWebSocket: () => {
    const { ws } = get()
    if (ws) {
      ws.close()
      set({ ws: null, wsConnected: false })
    }
  },
  
  // ============ Refresh helpers ============
  refreshTasks: async () => {
    try {
      const tasksData = await api.fetchTasks()
      set({ tasks: tasksData.map(transformTask) })
    } catch (error) {
      console.error('Failed to refresh tasks:', error)
    }
  },
  
  refreshActivity: async () => {
    try {
      const activityData = await api.fetchActivity()
      set({ liveFeed: activityData.map(transformActivity) })
    } catch (error) {
      console.error('Failed to refresh activity:', error)
    }
  },
  
  refreshRecurringTasks: async () => {
    try {
      const recurringData = await api.fetchRecurringTasks()
      set({ recurringTasks: recurringData })
    } catch (error) {
      console.error('Failed to refresh recurring tasks:', error)
    }
  },
  
  addFeedItem: (item) => {
    set(s => ({
      liveFeed: [{
        id: `feed-${Date.now()}`,
        timestamp: 'Just now',
        ...item,
      }, ...s.liveFeed].slice(0, 50)
    }))
  },
  
  // ============ UI Actions ============
  selectTask: (taskId) => set({ selectedTaskId: taskId }),
  closeTask: () => set({ selectedTaskId: null }),
  toggleChat: () => set((state) => ({ 
    isChatOpen: !state.isChatOpen,
    // Reset unread count when opening chat (user is now reading messages)
    unreadChatCount: !state.isChatOpen ? 0 : state.unreadChatCount
  })),
  markChatAsRead: () => set({ unreadChatCount: 0 }),
  openAnnouncement: () => set({ isAnnouncementOpen: true }),
  closeAnnouncement: () => set({ isAnnouncementOpen: false }),
  toggleNotifications: () => set((state) => ({ isNotificationsOpen: !state.isNotificationsOpen })),
  closeNotifications: () => set({ isNotificationsOpen: false }),
  openNewTask: () => set({ isNewTaskOpen: true }),
  closeNewTask: () => set({ isNewTaskOpen: false }),
  
  toggleAgentFilter: (agentId) => set((state) => ({
    selectedAgentId: state.selectedAgentId === agentId ? null : agentId
  })),
  clearAgentFilter: () => set({ selectedAgentId: null }),
  
  // Recurring tasks panel
  openRecurringPanel: () => set({ isRecurringPanelOpen: true }),
  closeRecurringPanel: () => set({ isRecurringPanelOpen: false, selectedRecurringTaskId: null }),
  toggleRecurringPanel: () => set((state) => ({ 
    isRecurringPanelOpen: !state.isRecurringPanelOpen,
    selectedRecurringTaskId: state.isRecurringPanelOpen ? null : state.selectedRecurringTaskId
  })),
  selectRecurringTask: (id) => set({ selectedRecurringTaskId: id }),
  
  // Agent Management panel
  openAgentManagement: () => set({ isAgentManagementOpen: true }),
  closeAgentManagement: () => set({ isAgentManagementOpen: false, editingAgentId: null }),
  toggleAgentManagement: () => set((state) => ({
    isAgentManagementOpen: !state.isAgentManagementOpen,
    editingAgentId: state.isAgentManagementOpen ? null : state.editingAgentId
  })),
  openAddAgentWizard: () => set({ isAddAgentWizardOpen: true }),
  closeAddAgentWizard: () => set({ isAddAgentWizardOpen: false }),
  setEditingAgent: (agentId) => set({ editingAgentId: agentId }),
  closeEditingAgent: () => set({ editingAgentId: null }),
  
  // ============ Notifications ============
  getUnreadCount: () => {
    const state = get()
    return state.notifications.filter(n => 
      n.toAgentId === state.currentAgentId && !n.read
    ).length
  },
  
  getMyNotifications: () => {
    const state = get()
    return state.notifications
      .filter(n => n.toAgentId === state.currentAgentId)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
  },
  
  markNotificationRead: (notifId) => set((state) => ({
    notifications: state.notifications.map(n =>
      n.id === notifId ? { ...n, read: true } : n
    )
  })),
  
  markAllNotificationsRead: () => set((state) => ({
    notifications: state.notifications.map(n =>
      n.toAgentId === state.currentAgentId ? { ...n, read: true } : n
    )
  })),
  
  openTaskFromNotification: (notifId, taskId) => {
    const state = get()
    state.markNotificationRead(notifId)
    set({ selectedTaskId: taskId, isNotificationsOpen: false })
  },
  
  // ============ Task Actions (API-backed) ============
  createTask: async (taskData) => {
    try {
      set({ loadingTasks: true })
      await api.createTask(taskData)
      // WebSocket will trigger refresh, but we close modal immediately
      set({ isNewTaskOpen: false, loadingTasks: false })
      // Fallback refresh in case WS is slow
      setTimeout(() => get().refreshTasks(), 500)
    } catch (error) {
      console.error('Failed to create task:', error)
      set({ loadingTasks: false })
      throw error
    }
  },
  
  moveTask: async (taskId, newStatus) => {
    const task = get().tasks.find(t => t.id === taskId)
    if (!task || task.status === newStatus) return
    
    try {
      // Optimistic update
      set(s => ({
        tasks: s.tasks.map(t => 
          t.id === taskId ? { ...t, status: newStatus } : t
        )
      }))
      
      // Map frontend status to backend status
      const backendStatus = newStatus === 'IN PROGRESS' ? 'IN_PROGRESS' : newStatus
      await api.updateTask(taskId, { status: backendStatus })
    } catch (error) {
      console.error('Failed to move task:', error)
      // Revert on error
      get().refreshTasks()
    }
  },
  
  moveTaskForward: async (taskId, reviewer = null) => {
    const task = get().tasks.find(t => t.id === taskId)
    const currentIndex = statusOrder.indexOf(task?.status)
    if (currentIndex >= statusOrder.length - 1) return
    
    const nextStatus = statusOrder[currentIndex + 1]
    
    try {
      if (nextStatus === 'REVIEW') {
        await api.reviewTask(taskId, 'send_to_review', null, reviewer || 'jarvis')
      } else {
        const backendStatus = nextStatus === 'IN PROGRESS' ? 'IN_PROGRESS' : nextStatus
        await api.updateTask(taskId, { status: backendStatus })
      }
      get().refreshTasks()
    } catch (error) {
      console.error('Failed to move task forward:', error)
    }
  },
  
  sendTaskBack: async (taskId, feedback = null) => {
    const task = get().tasks.find(t => t.id === taskId)
    if (!task) return
    
    try {
      if (task.status === 'REVIEW') {
        await api.reviewTask(taskId, 'reject', feedback)
      } else {
        const currentIndex = statusOrder.indexOf(task.status)
        if (currentIndex > 0) {
          const prevStatus = statusOrder[currentIndex - 1]
          const backendStatus = prevStatus === 'IN PROGRESS' ? 'IN_PROGRESS' : prevStatus
          await api.updateTask(taskId, { status: backendStatus })
          if (feedback) {
            await api.addTaskComment(taskId, 'main', `📝 Feedback: ${feedback}`)
          }
        }
      }
      get().refreshTasks()
    } catch (error) {
      console.error('Failed to send task back:', error)
    }
  },
  
  approveTask: async (taskId) => {
    try {
      await api.reviewTask(taskId, 'approve')
      get().refreshTasks()
    } catch (error) {
      console.error('Failed to approve task:', error)
    }
  },
  
  deleteTask: async (taskId) => {
    try {
      // Optimistic update - remove from UI immediately and close modal
      set(s => ({
        tasks: s.tasks.filter(t => t.id !== taskId),
        selectedTaskId: s.selectedTaskId === taskId ? null : s.selectedTaskId,
        selectedTask: s.selectedTaskId === taskId ? null : s.selectedTask
      }))
      await api.deleteTask(taskId)
    } catch (error) {
      console.error('Failed to delete task:', error)
      // Revert on error
      get().refreshTasks()
      throw error
    }
  },
  
  setReviewer: async (taskId, reviewer) => {
    try {
      await api.updateTask(taskId, { reviewer })
      get().refreshTasks()
    } catch (error) {
      console.error('Failed to set reviewer:', error)
    }
  },
  
  // ============ Comments (API-backed) ============
  addComment: async (taskId, agentId, text) => {
    try {
      await api.addTaskComment(taskId, agentId, text)
      
      // Create local notifications for @mentions
      const state = get()
      const mentionedAgentIds = parseMentions(text, state.agents)
      const newNotifications = mentionedAgentIds
        .filter(toAgentId => toAgentId !== agentId)
        .map(toAgentId => ({
          id: `notif-${Date.now()}-${toAgentId}`,
          type: 'mention',
          taskId,
          fromAgentId: agentId,
          toAgentId,
          text,
          read: false,
          timestamp: new Date().toISOString()
        }))
      
      if (newNotifications.length > 0) {
        set(s => ({
          notifications: [...s.notifications, ...newNotifications]
        }))
      }
      
      get().refreshTasks()
    } catch (error) {
      console.error('Failed to add comment:', error)
    }
  },
  
  // ============ Chat (API-backed) ============
  addChatMessage: async (text) => {
    const now = new Date()
    const timestamp = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
    const userMessageId = `user-${Date.now()}`
    const typingIndicatorId = `typing-${Date.now()}`
    
    // Check if message contains @mention to route to an agent
    const agents = get().agents
    const mentionRegex = /@([\w-]+)/g
    const mentions = []
    let match
    while ((match = mentionRegex.exec(text)) !== null) {
      const mentionName = match[1].toLowerCase()
      const agent = agents.find(a => 
        a.name.toLowerCase() === mentionName ||
        a.id.toLowerCase() === mentionName ||
        a.name.toLowerCase().replace(/\s+/g, '') === mentionName
      )
      if (agent) {
        mentions.push(agent)
      }
    }
    
    // Determine target agent
    const targetAgentId = mentions.length === 1 ? mentions[0].id : 'main'
    const targetAgent = agents.find(a => a.id === targetAgentId) || 
      { id: 'main', name: 'Jarvis', avatar: '🤖', color: '#F97316' }
    
    // 1. Immediately add user message
    const userMessage = {
      id: userMessageId,
      agentId: 'user',
      text: text,
      timestamp: timestamp,
      agent: { id: 'user', name: 'User', avatar: '👤', color: '#6B7280' }
    }
    
    // 2. Add typing indicator for target agent
    const typingMessage = {
      id: typingIndicatorId,
      agentId: targetAgentId,
      text: '...',
      timestamp: timestamp,
      agent: targetAgent,
      isTyping: true
    }
    
    set(s => ({
      squadMessages: [...s.squadMessages, userMessage, typingMessage],
      loadingChat: true
    }))
    
    try {
      console.log(`Routing message to agent: ${targetAgentId}`)
      const response = await api.sendChatMessageToAgent(targetAgentId, text)
      
      // 3. Remove typing indicator - the agent response will come via WebSocket
      // or we add it from the response if available
      set(s => ({
        squadMessages: s.squadMessages.filter(m => m.id !== typingIndicatorId),
        loadingChat: false
      }))
      
      // If response includes the agent's reply directly, add it
      if (response.reply) {
        const replyTimestamp = new Date()
        const replyMessage = {
          id: response.replyId || `reply-${Date.now()}`,
          agentId: targetAgentId,
          text: response.reply,
          timestamp: replyTimestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
          agent: targetAgent
        }
        set(s => ({
          squadMessages: [...s.squadMessages, replyMessage]
        }))
      }
    } catch (error) {
      console.error('Failed to send chat message:', error)
      // Remove typing indicator on error
      set(s => ({
        squadMessages: s.squadMessages.filter(m => m.id !== typingIndicatorId),
        loadingChat: false
      }))
      throw error
    }
  },
  
  // ============ Announcements (API-backed) ============
  broadcastAnnouncement: async (title, message, priority) => {
    try {
      await api.createAnnouncement(title, message, priority.toUpperCase())
      set({ isAnnouncementOpen: false })
    } catch (error) {
      console.error('Failed to broadcast announcement:', error)
      throw error
    }
  },
  
  // ============ Recurring Tasks Actions ============
  createRecurringTask: async (taskData) => {
    try {
      set({ loadingRecurring: true })
      await api.createRecurringTask(taskData)
      await get().refreshRecurringTasks()
      set({ loadingRecurring: false })
    } catch (error) {
      console.error('Failed to create recurring task:', error)
      set({ loadingRecurring: false })
      throw error
    }
  },
  
  toggleRecurringTask: async (recurringId) => {
    try {
      const task = get().recurringTasks.find(t => t.id === recurringId)
      if (!task) return
      
      // Optimistic update
      set(s => ({
        recurringTasks: s.recurringTasks.map(t => 
          t.id === recurringId ? { ...t, is_active: !t.is_active } : t
        )
      }))
      
      await api.updateRecurringTask(recurringId, { is_active: !task.is_active })
    } catch (error) {
      console.error('Failed to toggle recurring task:', error)
      get().refreshRecurringTasks()
    }
  },
  
  deleteRecurringTask: async (recurringId) => {
    try {
      // Optimistic update
      set(s => ({
        recurringTasks: s.recurringTasks.filter(t => t.id !== recurringId),
        selectedRecurringTaskId: s.selectedRecurringTaskId === recurringId ? null : s.selectedRecurringTaskId
      }))
      
      await api.deleteRecurringTask(recurringId)
    } catch (error) {
      console.error('Failed to delete recurring task:', error)
      get().refreshRecurringTasks()
    }
  },
  
  triggerRecurringTask: async (recurringId) => {
    try {
      await api.triggerRecurringTask(recurringId)
      await get().refreshRecurringTasks()
      await get().refreshTasks()
    } catch (error) {
      console.error('Failed to trigger recurring task:', error)
      throw error
    }
  },
  
  // ============ Agent Management Actions (API-backed) ============
  fetchModels: async () => {
    try {
      const models = await api.fetchAvailableModels()
      set({ availableModels: models })
      return models
    } catch (error) {
      console.error('Failed to fetch models:', error)
      return []
    }
  },
  
  generateAgentConfig: async (description) => {
    try {
      set({ loadingAgentManagement: true })
      const config = await api.generateAgentConfig(description)
      set({ loadingAgentManagement: false })
      return config
    } catch (error) {
      console.error('Failed to generate agent config:', error)
      set({ loadingAgentManagement: false })
      throw error
    }
  },
  
  createAgent: async (config) => {
    try {
      set({ loadingAgentManagement: true })
      const result = await api.createNewAgent(config)
      // Refresh agents list
      await get().refreshAgents()
      set({ loadingAgentManagement: false, isAddAgentWizardOpen: false })
      return result
    } catch (error) {
      console.error('Failed to create agent:', error)
      set({ loadingAgentManagement: false })
      throw error
    }
  },
  
  updateAgent: async (agentId, config) => {
    try {
      set({ loadingAgentManagement: true })
      await api.updateAgentConfig(agentId, config)
      // Refresh agents list
      await get().refreshAgents()
      set({ loadingAgentManagement: false })
    } catch (error) {
      console.error('Failed to update agent:', error)
      set({ loadingAgentManagement: false })
      throw error
    }
  },
  
  updateAgentFiles: async (agentId, files) => {
    try {
      set({ loadingAgentManagement: true })
      await api.updateAgentFiles(agentId, files)
      set({ loadingAgentManagement: false })
    } catch (error) {
      console.error('Failed to update agent files:', error)
      set({ loadingAgentManagement: false })
      throw error
    }
  },
  
  getAgentFiles: async (agentId) => {
    try {
      const files = await api.getAgentFiles(agentId)
      return files
    } catch (error) {
      console.error('Failed to get agent files:', error)
      throw error
    }
  },
  
  deleteAgent: async (agentId) => {
    try {
      set({ loadingAgentManagement: true })
      await api.deleteAgentConfig(agentId)
      // Refresh agents list
      await get().refreshAgents()
      set({ loadingAgentManagement: false, editingAgentId: null })
    } catch (error) {
      console.error('Failed to delete agent:', error)
      set({ loadingAgentManagement: false })
      throw error
    }
  },
  
  // ============ Checklist / Deliverables ============
  toggleChecklistItem: async (taskId, checklistItemId) => {
    try {
      await api.completeDeliverable(checklistItemId)
      get().refreshTasks()
    } catch (error) {
      console.error('Failed to toggle checklist item:', error)
    }
  },
  
  updateTaskDueDate: async (taskId, dueAt) => {
    // Note: Backend may need due_at endpoint - for now just update locally
    set(s => ({
      tasks: s.tasks.map(t =>
        t.id === taskId ? { ...t, dueAt } : t
      )
    }))
  },
  
  addDeliverableAttachment: (taskId, checklistItemId, attachment) => set((state) => ({
    tasks: state.tasks.map(t =>
      t.id === taskId
        ? {
            ...t,
            checklist: t.checklist.map(item =>
              item.id === checklistItemId
                ? { ...item, attachment }
                : item
            )
          }
        : t
    )
  })),
  
  removeDeliverableAttachment: (taskId, checklistItemId) => set((state) => ({
    tasks: state.tasks.map(t =>
      t.id === taskId
        ? {
            ...t,
            checklist: t.checklist.map(item =>
              item.id === checklistItemId
                ? { ...item, attachment: null }
                : item
            )
          }
        : t
    )
  })),
  
  // ============ Stats ============
  getStats: () => {
    const state = get()
    const now = new Date()
    const todayStr = now.toISOString().split('T')[0]
    
    const completedToday = state.tasks.filter(t => {
      if (t.status !== 'DONE' || !t.completedAt) return false
      return t.completedAt.split('T')[0] === todayStr
    }).length
    
    const weekData = Array(7).fill(0) // Placeholder - would need historical data
    
    return {
      completedToday,
      completedYesterday: 0,
      completedThisWeek: completedToday,
      trend: 0,
      weekData,
    }
  },
}))

export const statusOrder = ['INBOX', 'ASSIGNED', 'IN PROGRESS', 'REVIEW', 'DONE']

export const statusColors = {
  INBOX: 'var(--accent)',
  ASSIGNED: '#8B5CF6',
  'IN PROGRESS': '#F97316',
  REVIEW: '#0EA5E9',
  DONE: '#22C55E'
}

export const priorityColors = {
  Normal: '#1F2937',
  Urgent: '#DC2626'
}
