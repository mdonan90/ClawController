from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from models import Base, Agent, AgentRole, AgentStatus
import os

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///../data/mission_control.db")

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def init_db():
    """Create tables and seed initial agents."""
    Base.metadata.create_all(bind=engine)
    
    db = SessionLocal()
    try:
        # Check if agents exist
        if db.query(Agent).count() == 0:
            # Seed our agents
            agents = [
                Agent(
                    id="main",
                    name="Jarvis",
                    role=AgentRole.LEAD,
                    description="Squad Lead",
                    avatar="🤖",
                    status=AgentStatus.WORKING,
                    workspace="/Users/jarvisai/.openclaw/workspace-main"
                ),
                Agent(
                    id="dev",
                    name="Dev",
                    role=AgentRole.INT,
                    description="Developer Agent",
                    avatar="💻",
                    status=AgentStatus.WORKING,
                    workspace="/Users/jarvisai/.openclaw/workspace-dev"
                ),
                Agent(
                    id="trader",
                    name="Trader",
                    role=AgentRole.SPC,
                    description="Trading Specialist",
                    avatar="📈",
                    status=AgentStatus.WORKING,
                    workspace="/Users/jarvisai/.openclaw/workspace-trader"
                ),
                Agent(
                    id="sg-leadgen",
                    name="SG-LeadGen",
                    role=AgentRole.SPC,
                    description="Lead Generation",
                    avatar="🔍",
                    status=AgentStatus.IDLE,
                    workspace="/Users/jarvisai/.openclaw/workspace-sg-leadgen"
                ),
                Agent(
                    id="sg-sales",
                    name="SG-Sales",
                    role=AgentRole.SPC,
                    description="Sales Outreach",
                    avatar="💼",
                    status=AgentStatus.IDLE,
                    workspace="/Users/jarvisai/.openclaw/workspace-sg-sales"
                ),
                Agent(
                    id="rodel",
                    name="Rodel",
                    role=AgentRole.INT,
                    description="Safe Harbor Ops",
                    avatar="🏫",
                    status=AgentStatus.OFFLINE,
                    workspace="/Users/jarvisai/.openclaw/workspace-rodel"
                ),
            ]
            for agent in agents:
                db.add(agent)
            db.commit()
            print("Seeded 6 agents")
    finally:
        db.close()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
