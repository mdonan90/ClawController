from fastapi import FastAPI, Depends, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime
from pathlib import Path
import json
import asyncio
import os
import glob
import time
import subprocess

from database import init_db, get_db, SessionLocal
from models import (
    Agent, Task, Comment, Deliverable, ChatMessage, Announcement, ActivityLog,
    TaskStatus, Priority, AgentRole, AgentStatus,
    RecurringTask, RecurringTaskRun, TaskActivity
)

app = FastAPI(title="ClawController API", version="2.0.0")

# CORS for frontend (allow all origins for remote access)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# WebSocket connections
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except:
                pass

manager = ConnectionManager()

# Pydantic schemas
class AgentResponse(BaseModel):
    id: str
    name: str
    role: str
    description: Optional[str]
    avatar: Optional[str]
    status: str
    
    class Config:
        from_attributes = True

class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    priority: str = "NORMAL"
    tags: Optional[List[str]] = []
    assignee_id: Optional[str] = None

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    tags: Optional[List[str]] = None
    assignee_id: Optional[str] = None
    reviewer: Optional[str] = None  # "jarvis" or "mike"

class CommentCreate(BaseModel):
    content: str
    agent_id: str

class DeliverableCreate(BaseModel):
    title: str

class ChatMessageCreate(BaseModel):
    agent_id: str
    content: str

class AnnouncementCreate(BaseModel):
    title: Optional[str] = None
    message: str
    priority: str = "NORMAL"

# Recurring task schemas
class RecurringTaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    priority: str = "NORMAL"
    tags: Optional[List[str]] = []
    assignee_id: Optional[str] = None
    schedule_type: str  # daily, weekly, hourly, cron
    schedule_value: Optional[str] = None  # cron expression, hours, or comma-separated days
    schedule_time: Optional[str] = None  # HH:MM format

class RecurringTaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[str] = None
    tags: Optional[List[str]] = None
    assignee_id: Optional[str] = None
    schedule_type: Optional[str] = None
    schedule_value: Optional[str] = None
    schedule_time: Optional[str] = None
    is_active: Optional[bool] = None

class TaskActivityCreate(BaseModel):
    agent_id: str
    message: str

# Helper to log activity
async def log_activity(db: Session, activity_type: str, agent_id: str = None, task_id: str = None, description: str = None):
    activity = ActivityLog(
        activity_type=activity_type,
        agent_id=agent_id,
        task_id=task_id,
        description=description
    )
    db.add(activity)
    db.commit()
    
    # Broadcast to WebSocket clients
    await manager.broadcast({
        "type": "activity",
        "data": {
            "activity_type": activity_type,
            "agent_id": agent_id,
            "task_id": task_id,
            "description": description,
            "created_at": datetime.utcnow().isoformat()
        }
    })

# ============ Auto-Assignment Rules ============
# Tag → Agent mapping for automatic task assignment
ASSIGNMENT_RULES = {
    # Development
    "code": "dev",
    "bug": "dev",
    "feature": "dev",
    "frontend": "dev",
    "backend": "dev",
    "api": "dev",
    
    # Trading
    "trading": "trader",
    "kalshi": "trader",
    "market": "trader",
    "stocks": "trader",
    "options": "trader",
    
    # Lead Generation
    "leads": "sg-leadgen",
    "research": "sg-leadgen",
    "prospects": "sg-leadgen",
    
    # Sales
    "sales": "sg-sales",
    "outreach": "sg-sales",
    "email": "sg-sales",
    "pitch": "sg-sales",
    
    # Marketing
    "marketing": "brand",
    "brand": "brand",
    "content": "brand",
    "social": "brand",
    
    # Education
    "safeharbor": "rodel",
    "school": "rodel",
    "education": "rodel",
}

def get_auto_assignee(tags: list) -> str | None:
    """Find matching agent for given tags based on ASSIGNMENT_RULES."""
    if not tags:
        return None
    for tag in tags:
        tag_lower = tag.lower().strip()
        if tag_lower in ASSIGNMENT_RULES:
            return ASSIGNMENT_RULES[tag_lower]
    return None

# Helper to notify main agent when task is completed
def notify_task_completed(task, completed_by: str = None):
    """Notify main agent (Jarvis) when a task is marked DONE."""
    agent_name = completed_by or task.assignee_id or "Unknown"
    
    message = f"""✅ Task completed: {task.title}

**Completed by:** {agent_name}
**Task ID:** {task.id}
**Description:** {(task.description[:300] + '...') if task.description and len(task.description) > 300 else (task.description or 'No description')}

View in ClawController: http://localhost:5001"""

    try:
        subprocess.Popen(
            ["openclaw", "agent", "--agent", "main", "--message", message],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            cwd=str(Path.home())
        )
        print(f"Notified main agent of task completion: {task.title}")
    except Exception as e:
        print(f"Failed to notify main agent of completion: {e}")

# Helper to notify reviewer when task needs review
def notify_reviewer(task, submitted_by: str = None):
    """Notify reviewer when a task is submitted for review."""
    reviewer = task.reviewer or 'jarvis'
    agent_name = submitted_by or task.assignee_id or "Unknown"
    
    # Map reviewer name to agent ID
    reviewer_agent = 'main' if reviewer in ['jarvis', 'main'] else reviewer
    
    message = f"""📋 Task ready for review: {task.title}

**Submitted by:** {agent_name}
**Task ID:** {task.id}
**Description:** {(task.description[:300] + '...') if task.description and len(task.description) > 300 else (task.description or 'No description')}

**Actions:**
- Approve: `curl -X POST http://localhost:8000/api/tasks/{task.id}/review -H "Content-Type: application/json" -d '{{"action": "approve"}}'`
- Reject: `curl -X POST http://localhost:8000/api/tasks/{task.id}/review -H "Content-Type: application/json" -d '{{"action": "reject", "feedback": "Your feedback here"}}'`

View in ClawController: http://localhost:5001"""

    try:
        subprocess.Popen(
            ["openclaw", "agent", "--agent", reviewer_agent, "--message", message],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            cwd=str(Path.home())
        )
        print(f"Notified reviewer {reviewer_agent} of task needing review: {task.title}")
    except Exception as e:
        print(f"Failed to notify reviewer {reviewer_agent}: {e}")

# Helper to notify agent when their task is rejected
def notify_task_rejected(task, feedback: str = None, rejected_by: str = None):
    """Notify agent when their task is rejected and sent back."""
    if not task.assignee_id:
        return
    
    reviewer_name = rejected_by or "Reviewer"
    
    message = f"""🔄 Task sent back for changes: {task.title}

**Rejected by:** {reviewer_name}
**Task ID:** {task.id}
**Feedback:** {feedback or 'No feedback provided'}

Please address the feedback and resubmit when ready.

**Log activity:**
curl -X POST http://localhost:8000/api/tasks/{task.id}/activity -H "Content-Type: application/json" -d '{{"agent_id": "{task.assignee_id}", "message": "YOUR_UPDATE"}}'

View in ClawController: http://localhost:5001"""

    try:
        subprocess.Popen(
            ["openclaw", "agent", "--agent", task.assignee_id, "--message", message],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            cwd=str(Path.home())
        )
        print(f"Notified agent {task.assignee_id} of task rejection: {task.title}")
    except Exception as e:
        print(f"Failed to notify agent {task.assignee_id} of rejection: {e}")

# Helper to notify agent when task is assigned
def notify_agent_of_task(task):
    """Notify agent via OpenClaw when a task is assigned to them."""
    if not task.assignee_id:
        return
    if task.status not in [TaskStatus.ASSIGNED, TaskStatus.IN_PROGRESS]:
        return
    
    description_preview = (task.description[:500] + '...') if task.description and len(task.description) > 500 else (task.description or 'No description')
    
    message = f"""{task.status.value}: {task.title}

## Task ID: {task.id}

## Description
{description_preview}

## Log Activity
curl -X POST http://localhost:8000/api/tasks/{task.id}/activity -H "Content-Type: application/json" -d '{{"agent_id": "{task.assignee_id}", "message": "YOUR_UPDATE"}}'

## When Done
curl -X PATCH http://localhost:8000/api/tasks/{task.id} -H "Content-Type: application/json" -d '{{"status": "DONE"}}'"""

    try:
        subprocess.Popen(
            ["openclaw", "agent", "--agent", task.assignee_id, "--message", message],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            cwd=str(Path.home())
        )
        print(f"Notified agent {task.assignee_id} of task: {task.title}")
    except Exception as e:
        print(f"Failed to notify agent {task.assignee_id}: {e}")

# Startup
@app.on_event("startup")
async def startup():
    init_db()
    print("ClawController API started")

# WebSocket endpoint
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            # Handle incoming messages if needed
    except WebSocketDisconnect:
        manager.disconnect(websocket)

# Agent endpoints
@app.get("/api/agents", response_model=List[AgentResponse])
def get_agents(db: Session = Depends(get_db)):
    return db.query(Agent).all()

@app.get("/api/agents/{agent_id}", response_model=AgentResponse)
def get_agent(agent_id: str, db: Session = Depends(get_db)):
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent

@app.patch("/api/agents/{agent_id}/status")
async def update_agent_status(agent_id: str, status: str, db: Session = Depends(get_db)):
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    agent.status = AgentStatus(status)
    db.commit()
    await manager.broadcast({"type": "agent_status", "data": {"id": agent_id, "status": status}})
    return {"ok": True}

# ============ OpenClaw Integration ============

def get_agent_status_from_sessions(agent_id: str) -> str:
    """Determine agent status from session file activity."""
    home = Path.home()
    sessions_dir = home / ".openclaw" / "agents" / agent_id / "sessions"
    
    if not sessions_dir.exists():
        return "STANDBY"  # Configured but never activated - ready to go
    
    # Find the most recently modified session file
    session_files = list(sessions_dir.glob("*.jsonl"))
    if not session_files:
        return "STANDBY"  # Configured but no sessions yet - ready to go
    
    # Get the most recent modification time
    latest_mtime = 0
    for f in session_files:
        try:
            mtime = f.stat().st_mtime
            if mtime > latest_mtime:
                latest_mtime = mtime
        except:
            continue
    
    if latest_mtime == 0:
        return "STANDBY"
    
    # Calculate time since last activity
    now = time.time()
    elapsed_seconds = now - latest_mtime
    
    # Status thresholds
    if elapsed_seconds < 300:  # 5 minutes
        return "WORKING"
    elif elapsed_seconds < 1800:  # 30 minutes
        return "IDLE"
    else:
        return "STANDBY"  # Has sessions but inactive - ready to be activated

class OpenClawAgentResponse(BaseModel):
    id: str
    name: str
    role: str
    description: Optional[str] = None
    avatar: Optional[str] = None
    status: str
    emoji: Optional[str] = None
    workspace: Optional[str] = None
    model: Optional[dict] = None

@app.get("/api/openclaw/agents", response_model=List[OpenClawAgentResponse])
def get_openclaw_agents(db: Session = Depends(get_db)):
    """Get agents from OpenClaw config with real-time status from session activity."""
    home = Path.home()
    config_path = home / ".openclaw" / "openclaw.json"
    
    if not config_path.exists():
        raise HTTPException(status_code=404, detail="OpenClaw config not found")
    
    try:
        with open(config_path) as f:
            config = json.load(f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse OpenClaw config: {str(e)}")
    
    # Get agents with IN_PROGRESS tasks - they should show as WORKING
    working_agents = set()
    in_progress_tasks = db.query(Task).filter(Task.status == TaskStatus.IN_PROGRESS).all()
    for task in in_progress_tasks:
        if task.assignee_id:
            working_agents.add(task.assignee_id)
    
    agents_config = config.get("agents", {})
    agent_list = agents_config.get("list", [])
    
    result = []
    for agent in agent_list:
        agent_id = agent.get("id")
        if not agent_id:
            continue
        
        # Get real-time status from session files
        status = get_agent_status_from_sessions(agent_id)
        
        # Override to WORKING if agent has IN_PROGRESS tasks
        if agent_id in working_agents:
            status = "WORKING"
        
        # Determine role based on agent configuration
        role = "INT"  # Default to Developer
        if agent_id == "main":
            role = "LEAD"
        elif agent_id in ["trader", "rodel"]:
            role = "SPC"
        
        identity = agent.get("identity", {})
        name = identity.get("name") or agent.get("name") or agent_id
        emoji = identity.get("emoji") or "🤖"
        
        # Get description based on agent type
        descriptions = {
            "main": "Primary orchestrator and squad lead",
            "dev": "Code generation and development tasks",
            "trader": "Market analysis and trading operations",
            "sg-leadgen": "Lead generation for Sentiment Guardian",
            "sg-sales": "Sales outreach for Sentiment Guardian",
            "rodel": "Educational assistance specialist",
        }
        
        # Get model - use agent-specific or fall back to default
        agent_model = agent.get("model")
        if not agent_model:
            # Use default model from config (agents.defaults.model)
            defaults = agents_config.get("defaults", {})
            default_model = defaults.get("model")
            if default_model:
                agent_model = default_model
        
        result.append(OpenClawAgentResponse(
            id=agent_id,
            name=name,
            role=role,
            description=descriptions.get(agent_id, f"Agent: {name}"),
            avatar=emoji,
            status=status,
            emoji=emoji,
            workspace=agent.get("workspace"),
            model=agent_model
        ))
    
    return result

@app.get("/api/openclaw/status")
def get_openclaw_status():
    """Check if OpenClaw integration is available."""
    home = Path.home()
    config_path = home / ".openclaw" / "openclaw.json"
    
    return {
        "available": config_path.exists(),
        "config_path": str(config_path)
    }

# Task endpoints
@app.get("/api/tasks")
def get_tasks(status: Optional[str] = None, assignee_id: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(Task)
    if status:
        query = query.filter(Task.status == TaskStatus(status))
    if assignee_id:
        query = query.filter(Task.assignee_id == assignee_id)
    tasks = query.order_by(Task.created_at.desc()).all()
    
    result = []
    for task in tasks:
        result.append({
            "id": task.id,
            "title": task.title,
            "description": task.description,
            "status": task.status.value,
            "priority": task.priority.value,
            "tags": json.loads(task.tags) if task.tags else [],
            "assignee_id": task.assignee_id,
            "assignee": {"id": task.assignee.id, "name": task.assignee.name, "avatar": task.assignee.avatar} if task.assignee else None,
            "reviewer": task.reviewer,
            "created_at": task.created_at.isoformat(),
            "updated_at": task.updated_at.isoformat(),
            "comments_count": len(task.comments),
            "deliverables_count": len(task.deliverables),
            "deliverables_complete": sum(1 for d in task.deliverables if d.completed)
        })
    return result

@app.post("/api/tasks")
async def create_task(task_data: TaskCreate, db: Session = Depends(get_db)):
    # Determine assignee (explicit or auto-assigned by tags)
    assignee_id = task_data.assignee_id
    auto_assigned = False
    
    if not assignee_id and task_data.tags:
        auto_assignee = get_auto_assignee(task_data.tags)
        if auto_assignee:
            assignee_id = auto_assignee
            auto_assigned = True
    
    task = Task(
        title=task_data.title,
        description=task_data.description,
        priority=Priority(task_data.priority),
        tags=json.dumps(task_data.tags) if task_data.tags else "[]",
        assignee_id=assignee_id,
        status=TaskStatus.ASSIGNED if assignee_id else TaskStatus.INBOX,
        reviewer='jarvis'  # Default reviewer is Jarvis
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    
    # Log activity with auto-assign note if applicable
    activity_desc = f"Task created: {task.title}"
    if auto_assigned:
        activity_desc += f" (auto-assigned to {assignee_id})"
    await log_activity(db, "task_created", task_id=task.id, description=activity_desc)
    await manager.broadcast({"type": "task_created", "data": {"id": task.id, "title": task.title}})
    
    # Notify assigned agent
    if task.assignee_id:
        notify_agent_of_task(task)
    
    return {
        "id": task.id, 
        "title": task.title, 
        "status": task.status.value,
        "assignee_id": task.assignee_id,
        "auto_assigned": auto_assigned
    }

@app.get("/api/tasks/{task_id}")
def get_task(task_id: str, db: Session = Depends(get_db)):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    return {
        "id": task.id,
        "title": task.title,
        "description": task.description,
        "status": task.status.value,
        "priority": task.priority.value,
        "tags": json.loads(task.tags) if task.tags else [],
        "assignee_id": task.assignee_id,
        "assignee": {"id": task.assignee.id, "name": task.assignee.name, "avatar": task.assignee.avatar} if task.assignee else None,
        "reviewer": task.reviewer,
        "created_at": task.created_at.isoformat(),
        "updated_at": task.updated_at.isoformat(),
        "comments": [
            {
                "id": c.id,
                "content": c.content,
                "agent_id": c.agent_id,
                "agent": {"id": c.agent.id, "name": c.agent.name, "avatar": c.agent.avatar},
                "created_at": c.created_at.isoformat()
            } for c in task.comments
        ],
        "deliverables": [
            {
                "id": d.id,
                "title": d.title,
                "completed": d.completed,
                "completed_at": d.completed_at.isoformat() if d.completed_at else None
            } for d in task.deliverables
        ]
    }

@app.patch("/api/tasks/{task_id}")
async def update_task(task_id: str, task_data: TaskUpdate, db: Session = Depends(get_db)):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Track if we need to notify agent
    old_assignee = task.assignee_id
    old_status = task.status.value
    should_notify_assign = False
    should_notify_complete = False
    
    if task_data.title is not None:
        task.title = task_data.title
    if task_data.description is not None:
        task.description = task_data.description
    if task_data.status is not None:
        task.status = TaskStatus(task_data.status)
        await log_activity(db, "status_changed", task_id=task.id, description=f"Status: {old_status} → {task_data.status}")
        # Notify if status changed to ASSIGNED
        if task_data.status == "ASSIGNED" and task.assignee_id:
            should_notify_assign = True
        # Notify main agent if task completed
        if task_data.status == "DONE" and old_status != "DONE":
            should_notify_complete = True
    if task_data.priority is not None:
        task.priority = Priority(task_data.priority)
    if task_data.tags is not None:
        task.tags = json.dumps(task_data.tags)
    if task_data.assignee_id is not None:
        new_assignee = task_data.assignee_id if task_data.assignee_id != "" else None
        task.assignee_id = new_assignee
        if task.assignee_id and task.status == TaskStatus.INBOX:
            task.status = TaskStatus.ASSIGNED
        # Notify if assignee changed to a new agent
        if new_assignee and new_assignee != old_assignee:
            should_notify_assign = True
    if task_data.reviewer is not None:
        task.reviewer = task_data.reviewer if task_data.reviewer != "" else None
    
    db.commit()
    await manager.broadcast({"type": "task_updated", "data": {"id": task_id}})
    
    # Notify assigned agent after commit
    if should_notify_assign:
        db.refresh(task)
        notify_agent_of_task(task)
    
    # Notify main agent of task completion
    if should_notify_complete:
        db.refresh(task)
        notify_task_completed(task)
    
    return {"ok": True}

@app.delete("/api/tasks/{task_id}")
async def delete_task(task_id: str, db: Session = Depends(get_db)):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    db.delete(task)
    db.commit()
    await manager.broadcast({"type": "task_deleted", "data": {"id": task_id}})
    return {"ok": True}

# Review actions
class ReviewAction(BaseModel):
    action: str  # "approve" or "reject"
    feedback: Optional[str] = None
    reviewer: Optional[str] = None  # For sending to review

@app.post("/api/tasks/{task_id}/review")
async def review_task(task_id: str, review_data: ReviewAction, db: Session = Depends(get_db)):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    if review_data.action == "send_to_review":
        # Move task to REVIEW with specified reviewer
        task.status = TaskStatus.REVIEW
        task.reviewer = review_data.reviewer or "jarvis"
        db.commit()
        db.refresh(task)
        notify_reviewer(task)
        await log_activity(db, "sent_to_review", task_id=task.id, 
                          description=f"Task sent for review to {task.reviewer}")
    
    elif review_data.action == "approve":
        # Approve and move to DONE
        if task.status != TaskStatus.REVIEW:
            raise HTTPException(status_code=400, detail="Task is not in REVIEW status")
        old_reviewer = task.reviewer
        task.status = TaskStatus.DONE
        task.reviewer = None
        await log_activity(db, "task_approved", task_id=task.id,
                          description=f"Task approved by {old_reviewer}")
    
    elif review_data.action == "reject":
        # Reject with feedback and send back to IN_PROGRESS
        if task.status != TaskStatus.REVIEW:
            raise HTTPException(status_code=400, detail="Task is not in REVIEW status")
        old_reviewer = task.reviewer
        task.status = TaskStatus.IN_PROGRESS
        task.reviewer = None
        
        # Add feedback as a comment if provided
        if review_data.feedback:
            comment = Comment(
                task_id=task_id,
                agent_id="main",  # Jarvis
                content=f"📝 Review feedback: {review_data.feedback}"
            )
            db.add(comment)
        
        db.commit()
        db.refresh(task)
        notify_task_rejected(task, feedback=review_data.feedback, rejected_by=old_reviewer)
        
        await log_activity(db, "task_rejected", task_id=task.id,
                          description=f"Task sent back by {old_reviewer}: {review_data.feedback or 'No feedback'}")
    
    else:
        raise HTTPException(status_code=400, detail=f"Unknown action: {review_data.action}")
    
    db.commit()
    await manager.broadcast({"type": "task_reviewed", "data": {"id": task_id, "action": review_data.action}})
    
    return {"ok": True, "status": task.status.value}

# Comment endpoints
def parse_mentions(content: str) -> list[str]:
    """Extract @mentioned agent IDs from comment content."""
    # Pattern: @AgentName (word characters, may include spaces if quoted)
    # Match @word patterns
    import re
    mentions = re.findall(r'@(\w+)', content)
    return mentions

def get_agent_id_by_name(name: str, db: Session) -> str | None:
    """Find agent ID by name (case-insensitive)."""
    home = Path.home()
    config_path = home / ".openclaw" / "openclaw.json"
    
    if config_path.exists():
        try:
            with open(config_path) as f:
                config = json.load(f)
            agents_list = config.get("agents", {}).get("list", [])
            for agent in agents_list:
                agent_id = agent.get("id", "")
                identity = agent.get("identity", {})
                agent_name = identity.get("name") or agent.get("name") or agent_id
                # Match by ID or name (case-insensitive)
                if agent_id.lower() == name.lower() or agent_name.lower() == name.lower():
                    return agent_id
        except:
            pass
    return None

async def route_mention_to_agent(agent_id: str, task: Task, comment_content: str, commenter_name: str):
    """Send a message to an agent when @mentioned in a task comment."""
    # Build context message for the agent
    message = f"""You were mentioned in a task comment.

**Task:** {task.title}
**Status:** {task.status.value}
**Description:** {task.description or 'No description'}

**Comment from {commenter_name}:**
{comment_content}

Please review and respond appropriately. You can reply by adding a comment to this task via the API:
```
curl -X POST http://localhost:8000/api/tasks/{task.id}/comments -H "Content-Type: application/json" -d '{{"agent_id": "{agent_id}", "content": "Your response here"}}'
```"""

    try:
        # Use subprocess to call OpenClaw CLI
        subprocess.Popen(
            [
                "openclaw", "agent",
                "--agent", agent_id,
                "--message", message
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            cwd=str(Path.home())
        )
        print(f"Routed mention to agent {agent_id}")
    except Exception as e:
        # Log error but don't fail the comment creation
        print(f"Failed to route mention to agent {agent_id}: {e}")

@app.post("/api/tasks/{task_id}/comments")
async def add_comment(task_id: str, comment_data: CommentCreate, db: Session = Depends(get_db)):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    comment = Comment(
        task_id=task_id,
        agent_id=comment_data.agent_id,
        content=comment_data.content
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)
    
    agent = db.query(Agent).filter(Agent.id == comment_data.agent_id).first()
    commenter_name = agent.name if agent else comment_data.agent_id
    
    await log_activity(db, "comment_added", agent_id=comment_data.agent_id, task_id=task_id, 
                       description=f"{commenter_name} commented on {task.title}")
    await manager.broadcast({"type": "comment_added", "data": {"task_id": task_id, "comment_id": comment.id}})
    
    # Parse @mentions and route to agents
    mentions = parse_mentions(comment_data.content)
    routed_agents = []
    for mention in mentions:
        mentioned_agent_id = get_agent_id_by_name(mention, db)
        if mentioned_agent_id and mentioned_agent_id != comment_data.agent_id:
            # Don't route if agent mentions themselves
            await route_mention_to_agent(mentioned_agent_id, task, comment_data.content, commenter_name)
            routed_agents.append(mentioned_agent_id)
    
    return {"id": comment.id, "routed_to": routed_agents}

# Task Activity endpoints
@app.get("/api/tasks/{task_id}/activity")
def get_task_activity(task_id: str, limit: int = 50, db: Session = Depends(get_db)):
    """Get activity log entries for a specific task."""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    activities = db.query(TaskActivity).filter(
        TaskActivity.task_id == task_id
    ).order_by(TaskActivity.timestamp.desc()).limit(limit).all()
    
    result = []
    for activity in reversed(activities):  # Return oldest first
        agent = None
        if activity.agent_id:
            # Handle special "user" agent
            if activity.agent_id == "user":
                agent = {"id": "user", "name": "User", "avatar": "👤"}
            else:
                agent_obj = db.query(Agent).filter(Agent.id == activity.agent_id).first()
                if agent_obj:
                    agent = {"id": agent_obj.id, "name": agent_obj.name, "avatar": agent_obj.avatar}
                else:
                    # Fallback for unknown agents
                    agent = {"id": activity.agent_id, "name": activity.agent_id.title(), "avatar": "🤖"}
        
        result.append({
            "id": activity.id,
            "task_id": activity.task_id,
            "agent_id": activity.agent_id,
            "agent": agent,
            "message": activity.message,
            "timestamp": activity.timestamp.isoformat()
        })
    return result

@app.post("/api/tasks/{task_id}/activity")
async def add_task_activity(task_id: str, activity_data: TaskActivityCreate, db: Session = Depends(get_db)):
    """Add an activity log entry for a specific task.
    
    Auto-transitions:
    - ASSIGNED → IN_PROGRESS: First activity from assigned agent
    - IN_PROGRESS → REVIEW: Activity contains completion keywords
    """
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    activity = TaskActivity(
        task_id=task_id,
        agent_id=activity_data.agent_id,
        message=activity_data.message
    )
    db.add(activity)
    
    # === AUTO-TRANSITIONS ===
    old_status = task.status
    new_status = None
    
    # 1. ASSIGNED → IN_PROGRESS: First activity from the assigned agent
    if task.status == TaskStatus.ASSIGNED and activity_data.agent_id == task.assignee_id:
        # Check if this is first activity from the assignee
        existing_activity = db.query(TaskActivity).filter(
            TaskActivity.task_id == task_id,
            TaskActivity.agent_id == task.assignee_id
        ).first()
        if not existing_activity:
            task.status = TaskStatus.IN_PROGRESS
            new_status = TaskStatus.IN_PROGRESS
    
    # 2. IN_PROGRESS → REVIEW: Completion keywords in message
    if task.status == TaskStatus.IN_PROGRESS:
        completion_keywords = ['completed', 'done', 'finished', 'complete', 'task complete', 
                              'marking done', 'marking complete', '✅ done', '✅ complete',
                              'ready for review', 'awaiting review', 'submitted for review']
        message_lower = activity_data.message.lower()
        if any(kw in message_lower for kw in completion_keywords):
            task.status = TaskStatus.REVIEW
            new_status = TaskStatus.REVIEW
            # Set default reviewer if not set
            if not task.reviewer:
                task.reviewer = 'jarvis'
    
    db.commit()
    db.refresh(activity)
    
    agent = db.query(Agent).filter(Agent.id == activity_data.agent_id).first()
    
    # Broadcast activity added
    await manager.broadcast({
        "type": "task_activity_added",
        "data": {
            "task_id": task_id,
            "activity_id": activity.id,
            "agent": {"id": agent.id, "name": agent.name, "avatar": agent.avatar} if agent else None,
            "message": activity.message,
            "timestamp": activity.timestamp.isoformat()
        }
    })
    
    # Broadcast status change if it happened
    if new_status:
        await manager.broadcast({
            "type": "task_updated",
            "data": {"id": task_id, "status": new_status.value}
        })
        # Log the auto-transition
        log = ActivityLog(
            activity_type="status_changed",
            agent_id=activity_data.agent_id,
            task_id=task_id,
            description=f"Auto-transitioned: {old_status.value} → {new_status.value}"
        )
        db.add(log)
        db.commit()
        
        # Notify reviewer when task transitions to REVIEW
        if new_status == TaskStatus.REVIEW:
            db.refresh(task)
            notify_reviewer(task, submitted_by=activity_data.agent_id)
    
    return {"id": activity.id, "auto_transition": new_status.value if new_status else None}


@app.post("/api/tasks/{task_id}/complete")
async def complete_task(task_id: str, db: Session = Depends(get_db)):
    """Explicitly mark a task as complete, sending it to REVIEW.
    
    Used by agents to signal they've finished their work.
    The task will be reviewed by the assigned reviewer (default: jarvis).
    """
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    if task.status == TaskStatus.DONE:
        raise HTTPException(status_code=400, detail="Task is already done")
    
    if task.status == TaskStatus.REVIEW:
        raise HTTPException(status_code=400, detail="Task is already in review")
    
    old_status = task.status
    task.status = TaskStatus.REVIEW
    if not task.reviewer:
        task.reviewer = 'jarvis'
    
    db.commit()
    
    # Log the completion
    log = ActivityLog(
        activity_type="sent_to_review",
        agent_id=task.assignee_id,
        task_id=task_id,
        description=f"Task sent for review to {task.reviewer}"
    )
    db.add(log)
    db.commit()
    
    await manager.broadcast({
        "type": "task_updated",
        "data": {"id": task_id, "status": TaskStatus.REVIEW.value, "reviewer": task.reviewer}
    })
    
    # Notify reviewer
    db.refresh(task)
    notify_reviewer(task)
    
    return {"ok": True, "status": TaskStatus.REVIEW.value, "reviewer": task.reviewer}


# Deliverable endpoints
@app.post("/api/tasks/{task_id}/deliverables")
async def add_deliverable(task_id: str, deliverable_data: DeliverableCreate, db: Session = Depends(get_db)):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    deliverable = Deliverable(task_id=task_id, title=deliverable_data.title)
    db.add(deliverable)
    db.commit()
    db.refresh(deliverable)
    
    return {"id": deliverable.id}

@app.patch("/api/deliverables/{deliverable_id}/complete")
async def complete_deliverable(deliverable_id: str, db: Session = Depends(get_db)):
    deliverable = db.query(Deliverable).filter(Deliverable.id == deliverable_id).first()
    if not deliverable:
        raise HTTPException(status_code=404, detail="Deliverable not found")
    
    deliverable.completed = True
    deliverable.completed_at = datetime.utcnow()
    db.commit()
    
    await log_activity(db, "deliverable_complete", task_id=deliverable.task_id, 
                       description=f"Deliverable completed: {deliverable.title}")
    await manager.broadcast({"type": "deliverable_complete", "data": {"id": deliverable_id, "task_id": deliverable.task_id}})
    
    return {"ok": True}

# Chat endpoints
@app.get("/api/chat")
def get_chat_messages(limit: int = 50, db: Session = Depends(get_db)):
    messages = db.query(ChatMessage).order_by(ChatMessage.created_at.desc()).limit(limit).all()
    result = []
    for m in reversed(messages):
        if m.agent:
            agent_info = {"id": m.agent.id, "name": m.agent.name, "avatar": m.agent.avatar}
        else:
            # Handle user messages or missing agents
            agent_info = {"id": m.agent_id, "name": "User" if m.agent_id == "user" else m.agent_id, "avatar": "👤" if m.agent_id == "user" else "🤖"}
        result.append({
            "id": m.id,
            "content": m.content,
            "agent_id": m.agent_id,
            "agent": agent_info,
            "created_at": m.created_at.isoformat()
        })
    return result

@app.post("/api/chat")
async def send_chat_message(message_data: ChatMessageCreate, db: Session = Depends(get_db)):
    message = ChatMessage(
        agent_id=message_data.agent_id,
        content=message_data.content
    )
    db.add(message)
    db.commit()
    db.refresh(message)
    
    agent = db.query(Agent).filter(Agent.id == message_data.agent_id).first()
    # Fallback agent info if not found in database
    if agent:
        agent_info = {"id": agent.id, "name": agent.name, "avatar": agent.avatar}
    else:
        # Handle user messages or missing agents
        agent_info = {
            "id": message_data.agent_id,
            "name": "User" if message_data.agent_id == "user" else message_data.agent_id,
            "avatar": "👤" if message_data.agent_id == "user" else "🤖"
        }
    await manager.broadcast({
        "type": "chat_message",
        "data": {
            "id": message.id,
            "content": message.content,
            "agent_id": message.agent_id,
            "agent": agent_info,
            "created_at": message.created_at.isoformat()
        }
    })
    
    return {"id": message.id}


# ============ OpenClaw Agent Chat ============
import subprocess
import re

class SendToAgentRequest(BaseModel):
    agent_id: str
    message: str

def get_agent_info(agent_id: str, db: Session) -> dict:
    """Get agent info from OpenClaw config or fallback."""
    home = Path.home()
    config_path = home / ".openclaw" / "openclaw.json"
    
    # First try OpenClaw config
    if config_path.exists():
        try:
            with open(config_path) as f:
                config = json.load(f)
            agents_list = config.get("agents", {}).get("list", [])
            for agent in agents_list:
                if agent.get("id") == agent_id:
                    identity = agent.get("identity", {})
                    return {
                        "id": agent_id,
                        "name": identity.get("name") or agent.get("name") or agent_id,
                        "avatar": identity.get("emoji") or "🤖"
                    }
        except:
            pass
    
    # Fallback to database
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if agent:
        return {"id": agent.id, "name": agent.name, "avatar": agent.avatar}
    
    # Ultimate fallback
    return {"id": agent_id, "name": agent_id.title(), "avatar": "🤖"}

@app.post("/api/chat/send-to-agent")
async def send_to_agent(data: SendToAgentRequest, db: Session = Depends(get_db)):
    """Send a message to an OpenClaw agent and get the response."""
    agent_id = data.agent_id
    message = data.message
    
    if not agent_id or not message:
        raise HTTPException(status_code=400, detail="agent_id and message are required")
    
    # First, save and broadcast the user's message
    user_message = ChatMessage(agent_id="user", content=message)
    db.add(user_message)
    db.commit()
    db.refresh(user_message)
    
    await manager.broadcast({
        "type": "chat_message",
        "data": {
            "id": user_message.id,
            "content": user_message.content,
            "agent_id": "user",
            "agent": {"id": "user", "name": "User", "avatar": "👤"},
            "created_at": user_message.created_at.isoformat()
        }
    })
    
    # Call OpenClaw CLI to send message to agent
    try:
        result = subprocess.run(
            [
                "openclaw", "agent",
                "--agent", agent_id,
                "--message", message,
                "--json"
            ],
            capture_output=True,
            text=True,
            timeout=120,  # 2 minute timeout for agent response
            cwd=str(Path.home())
        )
        
        if result.returncode == 0:
            # Parse JSON response from OpenClaw
            try:
                response_data = json.loads(result.stdout)
                # OpenClaw returns: { result: { payloads: [{ text: "..." }] } }
                payloads = response_data.get("result", {}).get("payloads", [])
                if payloads:
                    # Combine all text payloads
                    texts = [p.get("text", "") for p in payloads if p.get("text")]
                    agent_response = "\n".join(texts) if texts else "(No text in response)"
                else:
                    # Fallback to other fields
                    agent_response = response_data.get("response", "") or response_data.get("content", "") or "(No response)"
            except json.JSONDecodeError:
                # If not JSON, use raw output
                agent_response = result.stdout.strip()
            
            if not agent_response:
                agent_response = "(No response from agent)"
        else:
            # Handle error
            error_msg = result.stderr.strip() if result.stderr else "Unknown error"
            agent_response = f"⚠️ Agent error: {error_msg}"
    
    except subprocess.TimeoutExpired:
        agent_response = "⚠️ Agent response timed out (120s limit)"
    except FileNotFoundError:
        agent_response = "⚠️ OpenClaw CLI not found"
    except Exception as e:
        agent_response = f"⚠️ Error: {str(e)}"
    
    # Get agent info for the response
    agent_info = get_agent_info(agent_id, db)
    
    # Save agent's response to chat
    agent_message = ChatMessage(agent_id=agent_id, content=agent_response)
    db.add(agent_message)
    db.commit()
    db.refresh(agent_message)
    
    # Broadcast agent's response
    await manager.broadcast({
        "type": "chat_message",
        "data": {
            "id": agent_message.id,
            "content": agent_message.content,
            "agent_id": agent_id,
            "agent": agent_info,
            "created_at": agent_message.created_at.isoformat()
        }
    })
    
    return {
        "ok": True,
        "user_message_id": user_message.id,
        "agent_message_id": agent_message.id,
        "response": agent_response
    }

# Announcement endpoints
@app.get("/api/announcements")
def get_announcements(limit: int = 10, db: Session = Depends(get_db)):
    announcements = db.query(Announcement).order_by(Announcement.created_at.desc()).limit(limit).all()
    return [
        {
            "id": a.id,
            "title": a.title,
            "message": a.message,
            "priority": a.priority.value,
            "created_at": a.created_at.isoformat()
        } for a in announcements
    ]

@app.post("/api/announcements")
async def create_announcement(announcement_data: AnnouncementCreate, db: Session = Depends(get_db)):
    announcement = Announcement(
        title=announcement_data.title,
        message=announcement_data.message,
        priority=Priority(announcement_data.priority)
    )
    db.add(announcement)
    db.commit()
    db.refresh(announcement)
    
    await log_activity(db, "announcement", description=f"📢 {announcement_data.message[:100]}")
    await manager.broadcast({
        "type": "announcement",
        "data": {
            "id": announcement.id,
            "title": announcement.title,
            "message": announcement.message,
            "priority": announcement.priority.value
        }
    })
    
    return {"id": announcement.id}

# Activity feed
@app.get("/api/activity")
def get_activity(limit: int = 50, db: Session = Depends(get_db)):
    activities = db.query(ActivityLog).order_by(ActivityLog.created_at.desc()).limit(limit).all()
    result = []
    for a in activities:
        agent = None
        if a.agent_id:
            agent_obj = db.query(Agent).filter(Agent.id == a.agent_id).first()
            if agent_obj:
                agent = {"id": agent_obj.id, "name": agent_obj.name, "avatar": agent_obj.avatar}
        
        result.append({
            "id": a.id,
            "activity_type": a.activity_type,
            "agent": agent,
            "task_id": a.task_id,
            "description": a.description,
            "created_at": a.created_at.isoformat()
        })
    return result

# Stats endpoint
@app.get("/api/stats")
def get_stats(db: Session = Depends(get_db)):
    agents_active = db.query(Agent).filter(Agent.status == AgentStatus.WORKING).count()
    tasks_in_queue = db.query(Task).filter(Task.status != TaskStatus.DONE).count()
    
    return {
        "agents_active": agents_active,
        "tasks_in_queue": tasks_in_queue,
        "tasks_by_status": {
            "INBOX": db.query(Task).filter(Task.status == TaskStatus.INBOX).count(),
            "ASSIGNED": db.query(Task).filter(Task.status == TaskStatus.ASSIGNED).count(),
            "IN_PROGRESS": db.query(Task).filter(Task.status == TaskStatus.IN_PROGRESS).count(),
            "REVIEW": db.query(Task).filter(Task.status == TaskStatus.REVIEW).count(),
            "DONE": db.query(Task).filter(Task.status == TaskStatus.DONE).count(),
        }
    }

# ============ Recurring Tasks ============
# Helper to calculate next run time
def calculate_next_run(schedule_type: str, schedule_value: str, schedule_time: str) -> datetime:
    """Calculate the next run time based on schedule configuration."""
    now = datetime.utcnow()
    
    if schedule_type == "daily":
        # Parse HH:MM time
        if schedule_time:
            hour, minute = map(int, schedule_time.split(':'))
            next_run = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
            if next_run <= now:
                next_run = next_run + timedelta(days=1)
            return next_run
        return now + timedelta(days=1)
    
    elif schedule_type == "weekly":
        # schedule_value contains comma-separated day numbers (0=Mon, 6=Sun)
        if schedule_value and schedule_time:
            days = [int(d.strip()) for d in schedule_value.split(',')]
            hour, minute = map(int, schedule_time.split(':'))
            
            # Find the next day that matches
            for i in range(7):
                check_date = now + timedelta(days=i)
                if check_date.weekday() in days:
                    next_run = check_date.replace(hour=hour, minute=minute, second=0, microsecond=0)
                    if next_run > now:
                        return next_run
            # Default to next week same day
            return now + timedelta(days=7)
        return now + timedelta(days=7)
    
    elif schedule_type == "hourly":
        # schedule_value contains the interval in hours
        hours = int(schedule_value) if schedule_value else 1
        return now + timedelta(hours=hours)
    
    elif schedule_type == "cron":
        # For cron, we'd need a cron parser library
        # For now, default to daily
        # TODO: Integrate with OpenClaw's cron system
        return now + timedelta(days=1)
    
    return now + timedelta(days=1)

# Import timedelta for schedule calculations
from datetime import timedelta

def format_schedule_human(schedule_type: str, schedule_value: str, schedule_time: str) -> str:
    """Format schedule as human-readable string."""
    if schedule_type == "daily":
        time_str = schedule_time if schedule_time else "00:00"
        return f"Every day at {time_str}"
    
    elif schedule_type == "weekly":
        day_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
        if schedule_value:
            days = [int(d.strip()) for d in schedule_value.split(',')]
            day_list = ", ".join([day_names[d] for d in days if 0 <= d <= 6])
            time_str = schedule_time if schedule_time else "00:00"
            return f"Weekly on {day_list} at {time_str}"
        return "Weekly"
    
    elif schedule_type == "hourly":
        hours = int(schedule_value) if schedule_value else 1
        if hours == 1:
            return "Every hour"
        return f"Every {hours} hours"
    
    elif schedule_type == "cron":
        return f"Cron: {schedule_value}"
    
    return schedule_type

@app.get("/api/recurring")
def list_recurring_tasks(db: Session = Depends(get_db)):
    """List all recurring tasks."""
    recurring_tasks = db.query(RecurringTask).order_by(RecurringTask.created_at.desc()).all()
    
    result = []
    for rt in recurring_tasks:
        result.append({
            "id": rt.id,
            "title": rt.title,
            "description": rt.description,
            "priority": rt.priority.value,
            "tags": json.loads(rt.tags) if rt.tags else [],
            "assignee_id": rt.assignee_id,
            "schedule_type": rt.schedule_type,
            "schedule_value": rt.schedule_value,
            "schedule_time": rt.schedule_time,
            "schedule_human": format_schedule_human(rt.schedule_type, rt.schedule_value, rt.schedule_time),
            "is_active": rt.is_active,
            "last_run_at": rt.last_run_at.isoformat() if rt.last_run_at else None,
            "next_run_at": rt.next_run_at.isoformat() if rt.next_run_at else None,
            "run_count": rt.run_count,
            "created_at": rt.created_at.isoformat()
        })
    return result

@app.post("/api/recurring")
async def create_recurring_task(task_data: RecurringTaskCreate, db: Session = Depends(get_db)):
    """Create a new recurring task."""
    next_run = calculate_next_run(
        task_data.schedule_type,
        task_data.schedule_value,
        task_data.schedule_time
    )
    
    recurring_task = RecurringTask(
        title=task_data.title,
        description=task_data.description,
        priority=Priority(task_data.priority.upper()) if task_data.priority else Priority.NORMAL,
        tags=json.dumps(task_data.tags) if task_data.tags else "[]",
        assignee_id=task_data.assignee_id,
        schedule_type=task_data.schedule_type,
        schedule_value=task_data.schedule_value,
        schedule_time=task_data.schedule_time,
        next_run_at=next_run
    )
    db.add(recurring_task)
    db.commit()
    db.refresh(recurring_task)
    
    # Note: Not logging to activity feed - recurring task management stays in its own panel
    await manager.broadcast({
        "type": "recurring_created",
        "data": {"id": recurring_task.id, "title": recurring_task.title}
    })
    
    # NOTE: This is where OpenClaw cron integration would hook in.
    # The cron job would check for recurring tasks with next_run_at <= now
    # and spawn new task instances.
    
    return {
        "id": recurring_task.id,
        "title": recurring_task.title,
        "next_run_at": recurring_task.next_run_at.isoformat()
    }

@app.get("/api/recurring/{recurring_id}")
def get_recurring_task(recurring_id: str, db: Session = Depends(get_db)):
    """Get a recurring task by ID."""
    rt = db.query(RecurringTask).filter(RecurringTask.id == recurring_id).first()
    if not rt:
        raise HTTPException(status_code=404, detail="Recurring task not found")
    
    return {
        "id": rt.id,
        "title": rt.title,
        "description": rt.description,
        "priority": rt.priority.value,
        "tags": json.loads(rt.tags) if rt.tags else [],
        "assignee_id": rt.assignee_id,
        "schedule_type": rt.schedule_type,
        "schedule_value": rt.schedule_value,
        "schedule_time": rt.schedule_time,
        "schedule_human": format_schedule_human(rt.schedule_type, rt.schedule_value, rt.schedule_time),
        "is_active": rt.is_active,
        "last_run_at": rt.last_run_at.isoformat() if rt.last_run_at else None,
        "next_run_at": rt.next_run_at.isoformat() if rt.next_run_at else None,
        "run_count": rt.run_count,
        "created_at": rt.created_at.isoformat()
    }

@app.patch("/api/recurring/{recurring_id}")
async def update_recurring_task(recurring_id: str, task_data: RecurringTaskUpdate, db: Session = Depends(get_db)):
    """Update a recurring task (pause/resume/edit)."""
    rt = db.query(RecurringTask).filter(RecurringTask.id == recurring_id).first()
    if not rt:
        raise HTTPException(status_code=404, detail="Recurring task not found")
    
    if task_data.title is not None:
        rt.title = task_data.title
    if task_data.description is not None:
        rt.description = task_data.description
    if task_data.priority is not None:
        rt.priority = Priority(task_data.priority.upper())
    if task_data.tags is not None:
        rt.tags = json.dumps(task_data.tags)
    if task_data.assignee_id is not None:
        rt.assignee_id = task_data.assignee_id if task_data.assignee_id != "" else None
    if task_data.schedule_type is not None:
        rt.schedule_type = task_data.schedule_type
    if task_data.schedule_value is not None:
        rt.schedule_value = task_data.schedule_value
    if task_data.schedule_time is not None:
        rt.schedule_time = task_data.schedule_time
    if task_data.is_active is not None:
        rt.is_active = task_data.is_active
        
        # When pausing, remove incomplete spawned tasks from the board
        if not task_data.is_active:
            # Find all tasks spawned from this recurring task that aren't complete
            runs = db.query(RecurringTaskRun).filter(
                RecurringTaskRun.recurring_task_id == recurring_id
            ).all()
            
            deleted_task_ids = []
            for run in runs:
                if run.task_id:
                    task = db.query(Task).filter(Task.id == run.task_id).first()
                    if task and task.status not in [TaskStatus.COMPLETE]:
                        deleted_task_ids.append(task.id)
                        db.delete(task)
            
            # Also delete the run records for deleted tasks
            for task_id in deleted_task_ids:
                db.query(RecurringTaskRun).filter(
                    RecurringTaskRun.task_id == task_id
                ).delete()
            
            # Broadcast task deletions
            for task_id in deleted_task_ids:
                await manager.broadcast({"type": "task_deleted", "data": {"id": task_id}})
    
    # Recalculate next run if schedule changed
    if any([task_data.schedule_type, task_data.schedule_value, task_data.schedule_time]):
        rt.next_run_at = calculate_next_run(
            rt.schedule_type,
            rt.schedule_value,
            rt.schedule_time
        )
    
    db.commit()
    await manager.broadcast({"type": "recurring_updated", "data": {"id": recurring_id}})
    
    return {"ok": True}

@app.delete("/api/recurring/{recurring_id}")
async def delete_recurring_task(recurring_id: str, db: Session = Depends(get_db)):
    """Delete a recurring task and all its incomplete spawned tasks."""
    rt = db.query(RecurringTask).filter(RecurringTask.id == recurring_id).first()
    if not rt:
        raise HTTPException(status_code=404, detail="Recurring task not found")
    
    # Find and delete all incomplete tasks spawned from this recurring task
    runs = db.query(RecurringTaskRun).filter(
        RecurringTaskRun.recurring_task_id == recurring_id
    ).all()
    
    deleted_task_ids = []
    for run in runs:
        if run.task_id:
            task = db.query(Task).filter(Task.id == run.task_id).first()
            if task and task.status not in [TaskStatus.COMPLETE]:
                deleted_task_ids.append(task.id)
                db.delete(task)
    
    # Delete all run records
    db.query(RecurringTaskRun).filter(
        RecurringTaskRun.recurring_task_id == recurring_id
    ).delete()
    
    db.delete(rt)
    db.commit()
    
    # Broadcast deletions
    for task_id in deleted_task_ids:
        await manager.broadcast({"type": "task_deleted", "data": {"id": task_id}})
    await manager.broadcast({"type": "recurring_deleted", "data": {"id": recurring_id}})
    
    return {"ok": True}

@app.get("/api/recurring/{recurring_id}/runs")
def get_recurring_task_runs(recurring_id: str, limit: int = 20, db: Session = Depends(get_db)):
    """Get run history for a recurring task."""
    rt = db.query(RecurringTask).filter(RecurringTask.id == recurring_id).first()
    if not rt:
        raise HTTPException(status_code=404, detail="Recurring task not found")
    
    runs = db.query(RecurringTaskRun).filter(
        RecurringTaskRun.recurring_task_id == recurring_id
    ).order_by(RecurringTaskRun.run_at.desc()).limit(limit).all()
    
    result = []
    for run in runs:
        task = None
        if run.task_id:
            task_obj = db.query(Task).filter(Task.id == run.task_id).first()
            if task_obj:
                task = {
                    "id": task_obj.id,
                    "title": task_obj.title,
                    "status": task_obj.status.value
                }
        
        result.append({
            "id": run.id,
            "run_at": run.run_at.isoformat(),
            "status": run.status,
            "task": task
        })
    
    return result

@app.post("/api/recurring/{recurring_id}/trigger")
async def trigger_recurring_task(recurring_id: str, db: Session = Depends(get_db)):
    """Manually trigger a recurring task run (for testing)."""
    rt = db.query(RecurringTask).filter(RecurringTask.id == recurring_id).first()
    if not rt:
        raise HTTPException(status_code=404, detail="Recurring task not found")
    
    # Create a new task from the recurring task template
    task = Task(
        title=f"{rt.title}",
        description=rt.description,
        priority=rt.priority,
        tags=rt.tags,
        assignee_id=rt.assignee_id,
        status=TaskStatus.ASSIGNED if rt.assignee_id else TaskStatus.INBOX
    )
    db.add(task)
    db.flush()  # Get the task ID
    
    # Record the run
    run = RecurringTaskRun(
        recurring_task_id=recurring_id,
        task_id=task.id,
        status="success"
    )
    db.add(run)
    
    # Update the recurring task
    rt.last_run_at = datetime.utcnow()
    rt.run_count += 1
    rt.next_run_at = calculate_next_run(rt.schedule_type, rt.schedule_value, rt.schedule_time)
    
    db.commit()
    
    # Note: Only broadcasting, not logging to activity feed - the task creation itself is the activity
    await manager.broadcast({"type": "task_created", "data": {"id": task.id, "title": task.title}})
    await manager.broadcast({"type": "recurring_run", "data": {"id": recurring_id, "task_id": task.id}})
    
    return {
        "ok": True,
        "task_id": task.id,
        "run_at": run.run_at.isoformat()
    }

# ============ Agent Management ============

# Available models
AVAILABLE_MODELS = [
    {"id": "anthropic/claude-opus-4-5", "alias": "opus", "description": "Most capable, complex tasks"},
    {"id": "anthropic/claude-sonnet-4", "alias": "sonnet", "description": "Balanced, good for writing"},
    {"id": "anthropic/claude-3-5-haiku-latest", "alias": "haiku", "description": "Fast, cost-efficient"},
    {"id": "openai-codex/gpt-5.2", "alias": "codex", "description": "Specialized for coding"}
]

@app.get("/api/models")
def get_models():
    """Return list of available models."""
    return AVAILABLE_MODELS


class GenerateAgentRequest(BaseModel):
    description: str

class GeneratedAgentConfig(BaseModel):
    id: str
    name: str
    emoji: str
    model: str
    soul: str
    tools: str
    agentsMd: str

@app.post("/api/agents/generate", response_model=GeneratedAgentConfig)
def generate_agent_config(request: GenerateAgentRequest):
    """AI-generate agent config from description (mock implementation)."""
    desc = request.description.lower()
    
    # Determine agent type based on keywords
    if any(kw in desc for kw in ["code", "develop", "program", "software", "debug", "engineer"]):
        return GeneratedAgentConfig(
            id="dev-agent",
            name="Dev Agent",
            emoji="👨‍💻",
            model="openai-codex/gpt-5.2",
            soul="""# Dev Agent

You are a skilled software developer AI assistant.

## Core Competencies
- Writing clean, maintainable code
- Debugging and troubleshooting
- Code review and optimization
- Following best practices and design patterns

## Behavior
- Always explain your reasoning
- Write tests for critical code
- Document complex logic
- Ask clarifying questions when requirements are unclear
""",
            tools="""# TOOLS.md

## Available Tools
- Code editor and file system access
- Git operations
- Package managers (npm, pip, etc.)
- Terminal/shell commands

## Preferences
- Use TypeScript over JavaScript when possible
- Follow project conventions
- Commit often with clear messages
""",
            agentsMd="""# AGENTS.md

Standard workspace configuration for development tasks.
Follow the guidance in SOUL.md for coding style and practices.
"""
        )
    
    elif any(kw in desc for kw in ["trade", "market", "stock", "crypto", "finance", "invest"]):
        return GeneratedAgentConfig(
            id="trader-agent",
            name="Trader Agent",
            emoji="📈",
            model="anthropic/claude-sonnet-4",
            soul="""# Trader Agent

You are a financial analysis and trading assistant.

## Core Competencies
- Market analysis and research
- Risk assessment
- Portfolio management advice
- News and sentiment analysis

## Behavior
- Always consider risk management
- Provide data-driven insights
- Never guarantee returns
- Explain your analysis methodology
""",
            tools="""# TOOLS.md

## Available Tools
- Market data APIs
- News aggregation
- Charting and analysis tools
- Portfolio tracking

## Important Notes
- All trading decisions are advisory only
- Always emphasize risk warnings
""",
            agentsMd="""# AGENTS.md

Standard workspace for trading and market analysis tasks.
"""
        )
    
    elif any(kw in desc for kw in ["sales", "lead", "outreach", "customer", "crm"]):
        return GeneratedAgentConfig(
            id="sales-agent",
            name="Sales Agent",
            emoji="🤝",
            model="anthropic/claude-sonnet-4",
            soul="""# Sales Agent

You are a sales and customer relations assistant.

## Core Competencies
- Lead qualification and research
- Outreach message crafting
- CRM management
- Follow-up scheduling

## Behavior
- Be professional but personable
- Research prospects before outreach
- Track all interactions
- Focus on value proposition
""",
            tools="""# TOOLS.md

## Available Tools
- CRM integration
- Email drafting
- LinkedIn research
- Calendar management
""",
            agentsMd="""# AGENTS.md

Standard workspace for sales and lead generation tasks.
"""
        )
    
    elif any(kw in desc for kw in ["write", "content", "blog", "article", "copy"]):
        return GeneratedAgentConfig(
            id="writer-agent",
            name="Writer Agent",
            emoji="✍️",
            model="anthropic/claude-sonnet-4",
            soul="""# Writer Agent

You are a creative writing and content assistant.

## Core Competencies
- Blog posts and articles
- Marketing copy
- Technical documentation
- Editing and proofreading

## Behavior
- Adapt tone to audience
- Research topics thoroughly
- Use clear, engaging language
- Follow style guides when provided
""",
            tools="""# TOOLS.md

## Available Tools
- Research and web search
- Document editing
- SEO optimization tools
- Grammar checking
""",
            agentsMd="""# AGENTS.md

Standard workspace for content creation tasks.
"""
        )
    
    elif any(kw in desc for kw in ["research", "analyze", "investigate", "study"]):
        return GeneratedAgentConfig(
            id="research-agent",
            name="Research Agent",
            emoji="🔍",
            model="anthropic/claude-opus-4-5",
            soul="""# Research Agent

You are a thorough research and analysis assistant.

## Core Competencies
- Deep research and investigation
- Data synthesis and analysis
- Report generation
- Source verification

## Behavior
- Always cite sources
- Present balanced perspectives
- Identify knowledge gaps
- Structure findings clearly
""",
            tools="""# TOOLS.md

## Available Tools
- Web search and browsing
- Document analysis
- Data visualization
- Note-taking systems
""",
            agentsMd="""# AGENTS.md

Standard workspace for research tasks.
"""
        )
    
    else:
        # Generic assistant
        agent_id = desc.split()[0].lower().replace(" ", "-")[:20] + "-agent"
        return GeneratedAgentConfig(
            id=agent_id,
            name="Assistant Agent",
            emoji="🤖",
            model="anthropic/claude-sonnet-4",
            soul=f"""# Assistant Agent

You are a helpful AI assistant based on: {request.description}

## Core Competencies
- Task completion and follow-through
- Clear communication
- Problem solving
- Proactive assistance

## Behavior
- Be helpful and thorough
- Ask for clarification when needed
- Provide structured responses
- Track progress on tasks
""",
            tools="""# TOOLS.md

## Available Tools
- General purpose tools
- File system access
- Web search
- Communication tools
""",
            agentsMd="""# AGENTS.md

Standard workspace configuration.
Read SOUL.md for personality and behavior guidelines.
"""
        )


class CreateAgentRequest(BaseModel):
    id: str
    name: str
    emoji: str
    model: str
    soul: str
    tools: str
    agentsMd: str
    discordChannelId: Optional[str] = None

@app.post("/api/agents")
def create_agent(request: CreateAgentRequest):
    """Create a new agent - creates workspace and patches openclaw.json."""
    home = Path.home()
    config_path = home / ".openclaw" / "openclaw.json"
    workspace_path = home / ".openclaw" / f"workspace-{request.id}"
    
    # Read existing config
    if not config_path.exists():
        raise HTTPException(status_code=404, detail="OpenClaw config not found")
    
    try:
        with open(config_path) as f:
            config = json.load(f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read config: {str(e)}")
    
    # Check if agent ID already exists
    agents_config = config.get("agents", {"list": []})
    agent_list = agents_config.get("list", [])
    
    if any(a.get("id") == request.id for a in agent_list):
        raise HTTPException(status_code=400, detail=f"Agent with id '{request.id}' already exists")
    
    # Create workspace directory
    workspace_path.mkdir(parents=True, exist_ok=True)
    
    # Write SOUL.md
    (workspace_path / "SOUL.md").write_text(request.soul)
    
    # Write TOOLS.md
    (workspace_path / "TOOLS.md").write_text(request.tools)
    
    # Write AGENTS.md
    (workspace_path / "AGENTS.md").write_text(request.agentsMd)
    
    # Create new agent config entry
    new_agent = {
        "id": request.id,
        "name": request.name,
        "workspace": str(workspace_path),
        "model": {"primary": request.model},
        "identity": {"name": request.name, "emoji": request.emoji}
    }
    
    # Add discord channel if provided
    if request.discordChannelId:
        new_agent["discord"] = {"channelId": request.discordChannelId}
    
    # Add to config
    agent_list.append(new_agent)
    agents_config["list"] = agent_list
    config["agents"] = agents_config
    
    # Write updated config
    try:
        with open(config_path, 'w') as f:
            json.dump(config, f, indent=2)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to write config: {str(e)}")
    
    return {
        "ok": True,
        "agent": new_agent,
        "workspace": str(workspace_path)
    }


class AgentFilesResponse(BaseModel):
    soul: str
    tools: str
    agentsMd: str

@app.get("/api/agents/{agent_id}/files", response_model=AgentFilesResponse)
def get_agent_files(agent_id: str):
    """Get agent workspace files (SOUL.md, AGENTS.md, TOOLS.md)."""
    home = Path.home()
    config_path = home / ".openclaw" / "openclaw.json"
    
    # Read config to get workspace path
    if not config_path.exists():
        raise HTTPException(status_code=404, detail="OpenClaw config not found")
    
    try:
        with open(config_path) as f:
            config = json.load(f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read config: {str(e)}")
    
    # Find agent
    agent_list = config.get("agents", {}).get("list", [])
    agent = next((a for a in agent_list if a.get("id") == agent_id), None)
    
    if not agent:
        raise HTTPException(status_code=404, detail=f"Agent '{agent_id}' not found")
    
    workspace = Path(agent.get("workspace", home / ".openclaw" / f"workspace-{agent_id}"))
    
    if not workspace.exists():
        raise HTTPException(status_code=404, detail=f"Workspace not found: {workspace}")
    
    # Read files (with defaults if missing)
    soul = ""
    tools = ""
    agents_md = ""
    
    soul_path = workspace / "SOUL.md"
    if soul_path.exists():
        soul = soul_path.read_text()
    
    tools_path = workspace / "TOOLS.md"
    if tools_path.exists():
        tools = tools_path.read_text()
    
    agents_path = workspace / "AGENTS.md"
    if agents_path.exists():
        agents_md = agents_path.read_text()
    
    return AgentFilesResponse(soul=soul, tools=tools, agentsMd=agents_md)


class UpdateAgentFilesRequest(BaseModel):
    soul: Optional[str] = None
    tools: Optional[str] = None
    agentsMd: Optional[str] = None

@app.put("/api/agents/{agent_id}/files")
def update_agent_files(agent_id: str, request: UpdateAgentFilesRequest):
    """Update agent workspace files."""
    home = Path.home()
    config_path = home / ".openclaw" / "openclaw.json"
    
    # Read config to get workspace path
    if not config_path.exists():
        raise HTTPException(status_code=404, detail="OpenClaw config not found")
    
    try:
        with open(config_path) as f:
            config = json.load(f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read config: {str(e)}")
    
    # Find agent
    agent_list = config.get("agents", {}).get("list", [])
    agent = next((a for a in agent_list if a.get("id") == agent_id), None)
    
    if not agent:
        raise HTTPException(status_code=404, detail=f"Agent '{agent_id}' not found")
    
    workspace = Path(agent.get("workspace", home / ".openclaw" / f"workspace-{agent_id}"))
    
    if not workspace.exists():
        workspace.mkdir(parents=True, exist_ok=True)
    
    # Update files
    if request.soul is not None:
        (workspace / "SOUL.md").write_text(request.soul)
    
    if request.tools is not None:
        (workspace / "TOOLS.md").write_text(request.tools)
    
    if request.agentsMd is not None:
        (workspace / "AGENTS.md").write_text(request.agentsMd)
    
    return {"ok": True}


class UpdateAgentConfigRequest(BaseModel):
    name: Optional[str] = None
    emoji: Optional[str] = None
    model: Optional[str] = None

@app.patch("/api/agents/{agent_id}")
def update_agent_config(agent_id: str, request: UpdateAgentConfigRequest):
    """Update agent config (model, identity) in openclaw.json."""
    home = Path.home()
    config_path = home / ".openclaw" / "openclaw.json"
    
    if not config_path.exists():
        raise HTTPException(status_code=404, detail="OpenClaw config not found")
    
    try:
        with open(config_path) as f:
            config = json.load(f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read config: {str(e)}")
    
    # Find and update agent
    agent_list = config.get("agents", {}).get("list", [])
    agent_index = next((i for i, a in enumerate(agent_list) if a.get("id") == agent_id), None)
    
    if agent_index is None:
        raise HTTPException(status_code=404, detail=f"Agent '{agent_id}' not found")
    
    agent = agent_list[agent_index]
    
    if request.name is not None:
        agent["name"] = request.name
        if "identity" not in agent:
            agent["identity"] = {}
        agent["identity"]["name"] = request.name
    
    if request.emoji is not None:
        if "identity" not in agent:
            agent["identity"] = {}
        agent["identity"]["emoji"] = request.emoji
    
    if request.model is not None:
        if "model" not in agent:
            agent["model"] = {}
        agent["model"]["primary"] = request.model
    
    agent_list[agent_index] = agent
    config["agents"]["list"] = agent_list
    
    # Write updated config
    try:
        with open(config_path, 'w') as f:
            json.dump(config, f, indent=2)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to write config: {str(e)}")
    
    return {"ok": True, "agent": agent}


@app.delete("/api/agents/{agent_id}")
def delete_agent(agent_id: str):
    """Remove agent from config (keeps workspace as archive)."""
    home = Path.home()
    config_path = home / ".openclaw" / "openclaw.json"
    
    if not config_path.exists():
        raise HTTPException(status_code=404, detail="OpenClaw config not found")
    
    try:
        with open(config_path) as f:
            config = json.load(f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read config: {str(e)}")
    
    # Find and remove agent
    agent_list = config.get("agents", {}).get("list", [])
    original_len = len(agent_list)
    agent_list = [a for a in agent_list if a.get("id") != agent_id]
    
    if len(agent_list) == original_len:
        raise HTTPException(status_code=404, detail=f"Agent '{agent_id}' not found")
    
    config["agents"]["list"] = agent_list
    
    # Write updated config
    try:
        with open(config_path, 'w') as f:
            json.dump(config, f, indent=2)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to write config: {str(e)}")
    
    return {"ok": True, "message": f"Agent '{agent_id}' removed (workspace preserved)"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
