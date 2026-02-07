from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from models import Base, Agent, AgentRole, AgentStatus
import os

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///../data/mission_control.db")

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def init_db():
    """Create tables. Users add their own agents via the UI."""
    Base.metadata.create_all(bind=engine)
    print("Database initialized. Add agents via the Agent Management panel.")

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
