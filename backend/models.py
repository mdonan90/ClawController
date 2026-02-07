from sqlalchemy import Column, String, Text, DateTime, Boolean, ForeignKey, Enum as SQLEnum, Integer
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from datetime import datetime
import enum
import uuid

Base = declarative_base()

def generate_uuid():
    return str(uuid.uuid4())

class TaskStatus(str, enum.Enum):
    INBOX = "INBOX"
    ASSIGNED = "ASSIGNED"
    IN_PROGRESS = "IN_PROGRESS"
    REVIEW = "REVIEW"
    DONE = "DONE"

class Priority(str, enum.Enum):
    NORMAL = "NORMAL"
    URGENT = "URGENT"

class AgentRole(str, enum.Enum):
    LEAD = "LEAD"
    INT = "INT"
    SPC = "SPC"

class AgentStatus(str, enum.Enum):
    WORKING = "WORKING"
    IDLE = "IDLE"
    STANDBY = "STANDBY"  # Configured but inactive - ready to activate
    OFFLINE = "OFFLINE"  # Not configured or unreachable

class Agent(Base):
    __tablename__ = "agents"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String(100), nullable=False)
    role = Column(SQLEnum(AgentRole), default=AgentRole.SPC)
    description = Column(String(200))
    avatar = Column(String(10))  # Emoji
    status = Column(SQLEnum(AgentStatus), default=AgentStatus.IDLE)
    workspace = Column(String(500))
    token = Column(String(64), nullable=True)  # Agent authentication token
    primary_model = Column(String(100), nullable=True)  # Primary model name
    fallback_model = Column(String(100), nullable=True)  # Fallback model name
    current_model = Column(String(100), nullable=True)  # Currently active model
    model_failure_count = Column(Integer, default=0)  # Track consecutive failures
    created_at = Column(DateTime, default=datetime.utcnow)
    
    tasks = relationship("Task", back_populates="assignee", foreign_keys="[Task.assignee_id]")
    reviewed_tasks = relationship("Task", back_populates="reviewer_agent", foreign_keys="[Task.reviewer_id]")
    comments = relationship("Comment", back_populates="agent")
    messages = relationship("ChatMessage", back_populates="agent")

class Task(Base):
    __tablename__ = "tasks"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    title = Column(String(200), nullable=False)
    description = Column(Text)
    status = Column(SQLEnum(TaskStatus), default=TaskStatus.INBOX)
    priority = Column(SQLEnum(Priority), default=Priority.NORMAL)
    tags = Column(String(500))  # JSON array as string
    assignee_id = Column(String, ForeignKey("agents.id"), nullable=True)
    reviewer = Column(String(50), nullable=True)  # Legacy field - "jarvis" or "mike" - who reviews this task
    reviewer_id = Column(String, ForeignKey("agents.id"), nullable=True, default='main')  # Agent ID for reviewer (default: main)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    due_at = Column(DateTime, nullable=True)
    
    assignee = relationship("Agent", back_populates="tasks", foreign_keys=[assignee_id])
    reviewer_agent = relationship("Agent", back_populates="reviewed_tasks", foreign_keys=[reviewer_id])
    comments = relationship("Comment", back_populates="task", cascade="all, delete-orphan")
    deliverables = relationship("Deliverable", back_populates="task", cascade="all, delete-orphan")

class Comment(Base):
    __tablename__ = "comments"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    task_id = Column(String, ForeignKey("tasks.id"), nullable=False)
    agent_id = Column(String, ForeignKey("agents.id"), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    task = relationship("Task", back_populates="comments")
    agent = relationship("Agent", back_populates="comments")

class Deliverable(Base):
    __tablename__ = "deliverables"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    task_id = Column(String, ForeignKey("tasks.id"), nullable=False)
    title = Column(String(200), nullable=False)
    completed = Column(Boolean, default=False)
    completed_at = Column(DateTime, nullable=True)
    file_path = Column(String(500), nullable=True)
    
    task = relationship("Task", back_populates="deliverables")

class ChatMessage(Base):
    __tablename__ = "chat_messages"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    agent_id = Column(String, ForeignKey("agents.id"), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    agent = relationship("Agent", back_populates="messages")

class Announcement(Base):
    __tablename__ = "announcements"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    title = Column(String(200), nullable=True)
    message = Column(Text, nullable=False)
    priority = Column(SQLEnum(Priority), default=Priority.NORMAL)
    created_at = Column(DateTime, default=datetime.utcnow)
    created_by = Column(String(100), default="human")

class ActivityLog(Base):
    __tablename__ = "activity_log"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    activity_type = Column(String(50), nullable=False)  # task_created, comment_added, status_changed, etc.
    agent_id = Column(String, nullable=True)
    task_id = Column(String, nullable=True)
    description = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

# ============ Recurring Tasks ============
class RecurringTask(Base):
    __tablename__ = "recurring_tasks"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    title = Column(String(200), nullable=False)
    description = Column(Text)
    priority = Column(SQLEnum(Priority), default=Priority.NORMAL)
    tags = Column(String(500))  # JSON array as string
    assignee_id = Column(String, ForeignKey("agents.id"), nullable=True)
    schedule_type = Column(String(50), nullable=False)  # daily, weekly, hourly, cron
    schedule_value = Column(String(100))  # cron expression, hours interval, or comma-separated days
    schedule_time = Column(String(10))  # HH:MM format for daily/weekly
    is_active = Column(Boolean, default=True)
    last_run_at = Column(DateTime, nullable=True)
    next_run_at = Column(DateTime, nullable=True)
    run_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    runs = relationship("RecurringTaskRun", back_populates="recurring_task", cascade="all, delete-orphan")

class RecurringTaskRun(Base):
    __tablename__ = "recurring_task_runs"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    recurring_task_id = Column(String, ForeignKey("recurring_tasks.id"), nullable=False)
    task_id = Column(String, ForeignKey("tasks.id"), nullable=True)  # The spawned task
    run_at = Column(DateTime, default=datetime.utcnow)
    status = Column(String(50), default="success")  # success, failed
    
    recurring_task = relationship("RecurringTask", back_populates="runs")


class TaskActivity(Base):
    """Task-specific activity log for tracking agent work on individual tasks."""
    __tablename__ = "task_activity"
    
    id = Column(String, primary_key=True, default=generate_uuid)
    task_id = Column(String, ForeignKey("tasks.id"), nullable=False)
    agent_id = Column(String, ForeignKey("agents.id"), nullable=True)
    message = Column(Text, nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)
    
    task = relationship("Task", backref="activity_entries")
