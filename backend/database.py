from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from models import Base, Agent, AgentRole, AgentStatus
import os
from pathlib import Path

# Get the directory where this script lives
SCRIPT_DIR = Path(__file__).parent.resolve()
DATA_DIR = SCRIPT_DIR.parent / "data"

# Create data directory if it doesn't exist
DATA_DIR.mkdir(parents=True, exist_ok=True)

# Default to local SQLite in the data folder
DEFAULT_DB = f"sqlite:///{DATA_DIR}/mission_control.db"
DATABASE_URL = os.getenv("DATABASE_URL", DEFAULT_DB)

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
