// API utility for ClawController
// Dynamically determine API URL based on current host
const currentHost = window.location.hostname
const API_BASE = `http://${currentHost}:8000`

export const getStoredApiKey = () => localStorage.getItem('CLAW_API_KEY')
export const setStoredApiKey = (key) => localStorage.setItem('CLAW_API_KEY', key)
export const clearStoredApiKey = () => localStorage.removeItem('CLAW_API_KEY')

const getWSUrl = () => {
  const key = getStoredApiKey() || 'claw-default-key'
  return `ws://${currentHost}:8000/ws?api_key=${key}`
}

// Generic fetch wrapper with error handling
async function fetchAPI(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`
  const apiKey = getStoredApiKey() || 'claw-default-key'

  const config = {
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
      ...options.headers,
    },
    ...options,
  }

  try {
    const response = await fetch(url, config)
    if (response.status === 401 || response.status === 403) {
      clearStoredApiKey()
      window.location.href = '/login'
      throw new Error('Authentication failed')
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Request failed' }))
      throw new Error(error.detail || `HTTP ${response.status}`)
    }
    return await response.json()
  } catch (error) {
    console.error(`API Error [${endpoint}]:`, error)
    throw error
  }
}

// ============ Agents ============

export async function updateAgentStatus(agentId, status) {
  return fetchAPI(`/api/agents/${agentId}/status?status=${status}`, { method: 'PATCH' })
}

// ============ OpenClaw Integration ============
export async function fetchOpenClawAgents() {
  return fetchAPI('/api/openclaw/agents')
}

export async function checkOpenClawStatus() {
  try {
    return await fetchAPI('/api/openclaw/status')
  } catch {
    return { available: false }
  }
}

// Primary agent fetching - uses live OpenClaw configuration only
export async function fetchAgents() {
  try {
    const status = await checkOpenClawStatus()
    if (status.available) {
      return await fetchOpenClawAgents()
    } else {
      console.warn('OpenClaw configuration not found')
      return [] // Return empty array - no database fallback
    }
  } catch (e) {
    console.error('Failed to fetch OpenClaw agents:', e)
    return [] // Return empty array - no database fallback
  }
}

// Legacy database agent fetch (deprecated - keeping for reference)
export async function fetchDatabaseAgents() {
  return fetchAPI('/api/agents')
}

// Alias for backward compatibility
export const fetchAgentsWithOpenClaw = fetchAgents

export async function importAgentsFromOpenClaw(agentIds) {
  return fetchAPI('/api/openclaw/import', {
    method: 'POST',
    body: JSON.stringify({ agent_ids: agentIds }),
  })
}

// ============ Tasks ============
export async function fetchTasks(filters = {}) {
  const params = new URLSearchParams()
  if (filters.status) params.append('status', filters.status)
  if (filters.assignee_id) params.append('assignee_id', filters.assignee_id)
  const query = params.toString() ? `?${params}` : ''
  return fetchAPI(`/api/tasks${query}`)
}

export async function fetchTask(taskId) {
  return fetchAPI(`/api/tasks/${taskId}`)
}

export async function createTask(taskData) {
  return fetchAPI('/api/tasks', {
    method: 'POST',
    body: JSON.stringify({
      title: taskData.title,
      description: taskData.description || null,
      priority: (taskData.priority || 'Normal').toUpperCase(),
      tags: taskData.tags || [],
      assignee_id: taskData.assignedTo || taskData.assignee_id || null,
    }),
  })
}

export async function updateTask(taskId, updates) {
  return fetchAPI(`/api/tasks/${taskId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  })
}

export async function deleteTask(taskId) {
  return fetchAPI(`/api/tasks/${taskId}`, { method: 'DELETE' })
}

// ============ Task Review ============
export async function reviewTask(taskId, action, feedback = null, reviewer = null) {
  return fetchAPI(`/api/tasks/${taskId}/review`, {
    method: 'POST',
    body: JSON.stringify({ action, feedback, reviewer }),
  })
}

// ============ Comments ============
export async function addTaskComment(taskId, agentId, content) {
  return fetchAPI(`/api/tasks/${taskId}/comments`, {
    method: 'POST',
    body: JSON.stringify({ agent_id: agentId, content }),
  })
}

// ============ Deliverables ============
export async function addDeliverable(taskId, title) {
  return fetchAPI(`/api/tasks/${taskId}/deliverables`, {
    method: 'POST',
    body: JSON.stringify({ title }),
  })
}

export async function completeDeliverable(deliverableId) {
  return fetchAPI(`/api/deliverables/${deliverableId}/complete`, { method: 'PATCH' })
}

// ============ Chat ============
export async function fetchChatMessages(limit = 50) {
  return fetchAPI(`/api/chat?limit=${limit}`)
}

export async function sendChatMessage(agentId, content) {
  return fetchAPI('/api/chat', {
    method: 'POST',
    body: JSON.stringify({ agent_id: agentId, content }),
  })
}

export async function sendChatMessageToAgent(agentId, message) {
  // Send message to a specific OpenClaw agent and get response
  return fetchAPI('/api/chat/send-to-agent', {
    method: 'POST',
    body: JSON.stringify({ agent_id: agentId, message }),
  })
}

// ============ Announcements ============
export async function fetchAnnouncements(limit = 10) {
  return fetchAPI(`/api/announcements?limit=${limit}`)
}

export async function createAnnouncement(title, message, priority = 'NORMAL') {
  return fetchAPI('/api/announcements', {
    method: 'POST',
    body: JSON.stringify({ title, message, priority }),
  })
}

// ============ Activity ============
export async function fetchActivity(limit = 50) {
  return fetchAPI(`/api/activity?limit=${limit}`)
}

// ============ Task Activity ============
export async function fetchTaskActivity(taskId, limit = 50) {
  return fetchAPI(`/api/tasks/${taskId}/activity?limit=${limit}`)
}

export async function addTaskActivity(taskId, agentId, message) {
  return fetchAPI(`/api/tasks/${taskId}/activity`, {
    method: 'POST',
    body: JSON.stringify({ agent_id: agentId, message }),
  })
}

// ============ Stats ============
export async function fetchStats() {
  return fetchAPI('/api/stats')
}

// ============ Recurring Tasks ============
export async function fetchRecurringTasks() {
  return fetchAPI('/api/recurring')
}

export async function fetchRecurringTask(recurringId) {
  return fetchAPI(`/api/recurring/${recurringId}`)
}

export async function createRecurringTask(taskData) {
  return fetchAPI('/api/recurring', {
    method: 'POST',
    body: JSON.stringify({
      title: taskData.title,
      description: taskData.description || null,
      priority: (taskData.priority || 'Normal').toUpperCase(),
      tags: taskData.tags || [],
      assignee_id: taskData.assignedTo || taskData.assignee_id || null,
      schedule_type: taskData.scheduleType,
      schedule_value: taskData.scheduleValue || null,
      schedule_time: taskData.scheduleTime || null,
    }),
  })
}

export async function updateRecurringTask(recurringId, updates) {
  return fetchAPI(`/api/recurring/${recurringId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  })
}

export async function deleteRecurringTask(recurringId) {
  return fetchAPI(`/api/recurring/${recurringId}`, { method: 'DELETE' })
}

export async function triggerRecurringTask(recurringId) {
  return fetchAPI(`/api/recurring/${recurringId}/trigger`, { method: 'POST' })
}

export async function fetchRecurringTaskRuns(recurringId, limit = 20) {
  return fetchAPI(`/api/recurring/${recurringId}/runs?limit=${limit}`)
}

// ============ WebSocket ============
export function createWebSocket(onMessage, onOpen, onClose, onError) {
  const ws = new WebSocket(getWSUrl())

  ws.onopen = () => {
    console.log('WebSocket connected')
    onOpen?.()
  }

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)
      onMessage?.(data)
    } catch (e) {
      console.error('WebSocket parse error:', e)
    }
  }

  ws.onclose = () => {
    console.log('WebSocket disconnected')
    onClose?.()
  }

  ws.onerror = (error) => {
    console.error('WebSocket error:', error)
    onError?.(error)
  }

  return ws
}

// ============ Agent Management ============
export async function fetchAvailableModels() {
  return fetchAPI('/api/models')
}

export async function generateAgentConfig(description) {
  return fetchAPI('/api/agents/generate', {
    method: 'POST',
    body: JSON.stringify({ description }),
  })
}

export async function createNewAgent(agentConfig) {
  return fetchAPI('/api/agents', {
    method: 'POST',
    body: JSON.stringify(agentConfig),
  })
}

export async function getAgentFiles(agentId) {
  return fetchAPI(`/api/agents/${agentId}/files`)
}

export async function updateAgentFiles(agentId, files) {
  return fetchAPI(`/api/agents/${agentId}/files`, {
    method: 'PUT',
    body: JSON.stringify(files),
  })
}

export async function updateAgentConfig(agentId, updates) {
  return fetchAPI(`/api/agents/${agentId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  })
}

export async function deleteAgentConfig(agentId) {
  return fetchAPI(`/api/agents/${agentId}`, {
    method: 'DELETE',
  })
}

export { API_BASE, getWSUrl as WS_URL }

// Generic API object for simple get/post calls
export const api = {
  get: (endpoint) => fetchAPI(endpoint, { method: 'GET' }),
  post: (endpoint, data) => fetchAPI(endpoint, { method: 'POST', body: JSON.stringify(data) }),
  patch: (endpoint, data) => fetchAPI(endpoint, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (endpoint) => fetchAPI(endpoint, { method: 'DELETE' })
}
