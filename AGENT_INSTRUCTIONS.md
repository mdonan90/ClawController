# ClawController Agent Instructions

Instructions for agents integrating with ClawController task management.

---

## For Orchestrator Agents (Lead/Manager)

### Delegating Tasks to Other Agents

**Always use the `/route` endpoint for fresh context per task:**

```bash
# 1. Create task with assignee
curl -X POST http://localhost:8000/api/tasks \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{
    "title": "Task title",
    "description": "Full task details and requirements",
    "assignee_id": "dev",
    "status": "ASSIGNED"
  }'

# 2. Log delegation
curl -X POST http://localhost:8000/api/tasks/{TASK_ID}/activity \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{"agent_id": "main", "message": "Delegating to Dev agent"}'

# 3. Route with fresh context
curl -X POST http://localhost:8000/api/tasks/{TASK_ID}/route \
  -H "X-API-Key: YOUR_API_KEY"
```

### Why Use /route?
- **Fresh context window** — Each task gets isolated session (no bleed)
- **No context limits** — Agent won't hit limits mid-task
- **Uses agent's model** — Dev uses Sonnet, not your Opus
- **Auto-tracking** — Session monitor detects activity
- **Task-specific** — Session labeled with task ID

### Task Lifecycle (Orchestrator View)
1. **INBOX** → Task created, no assignee
2. **ASSIGNED** → You assigned someone (set assignee_id)
3. **IN_PROGRESS** → Agent working (auto-detected by session monitor)
4. **REVIEW** → Agent submitted for your review
5. **DONE** → You approved via `/api/tasks/{id}/review`

### Approving Tasks
```bash
curl -X POST http://localhost:8000/api/tasks/{TASK_ID}/review \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{"action": "approve", "agent_id": "main"}'
```

---

## For Worker Agents (Dev, Trader, etc.)

### When You Receive a Task

The orchestrator routes tasks to you via ClawController. You'll receive task details including:
- Task ID
- Title and description
- Completion instructions

### Logging Activity (REQUIRED)
Log progress as you work — this is how the dashboard tracks your progress:

```bash
curl -X POST http://localhost:8000/api/tasks/{TASK_ID}/activity \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{"agent_id": "YOUR_AGENT_ID", "message": "What you did or found"}'
```

### Completing Tasks
When finished, submit for review:

```bash
# Log completion
curl -X POST http://localhost:8000/api/tasks/{TASK_ID}/activity \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{"agent_id": "YOUR_AGENT_ID", "message": "✅ Completed: summary of what was done"}'

# Submit for review
curl -X PATCH http://localhost:8000/api/tasks/{TASK_ID} \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{"status": "REVIEW"}'
```

### Key Rules
- **Always log activity** — Dashboard tracks via activity logs
- **Submit to REVIEW, not DONE** — Only reviewers can approve to DONE
- **Include task ID in commits** — For code tasks, reference the task ID

---

## API Reference

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/tasks` | GET | List tasks (filter: `?status=X&assignee_id=Y`) |
| `/api/tasks` | POST | Create task |
| `/api/tasks/{id}` | PATCH | Update task status/fields |
| `/api/tasks/{id}/activity` | POST | Log activity |
| `/api/tasks/{id}/route` | POST | Route to agent with fresh context |
| `/api/tasks/{id}/review` | POST | Approve/reject task |

---

Copy the relevant section into your agent's TOOLS.md or AGENTS.md.
