from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker
from models import Base, Agent, AgentRole, AgentStatus
import os
from pathlib import Path
import logging
import secrets

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

def auto_migrate():
    """Auto-migration: Add missing columns to existing tables."""
    inspector = inspect(engine)
    
    # Get all existing tables
    existing_tables = inspector.get_table_names()
    
    migrations_executed = []
    
    with engine.connect() as conn:
        # Check each table defined in models
        for table_name, table in Base.metadata.tables.items():
            if table_name not in existing_tables:
                # Table doesn't exist, skip (will be created by create_all)
                continue
                
            # Get existing columns for this table
            existing_columns = {col['name'] for col in inspector.get_columns(table_name)}
            
            # Check each column in the model
            for column in table.columns:
                if column.name not in existing_columns:
                    # Column is missing, create ALTER TABLE statement
                    col_type = column.type.compile(dialect=engine.dialect)
                    
                    # Handle column constraints
                    constraints = []
                    if not column.nullable:
                        constraints.append("NOT NULL")
                    if column.default is not None:
                        default_val = column.default.arg if hasattr(column.default, 'arg') else column.default
                        if isinstance(default_val, str):
                            constraints.append(f"DEFAULT '{default_val}'")
                        else:
                            constraints.append(f"DEFAULT {default_val}")
                    
                    constraint_str = " " + " ".join(constraints) if constraints else ""
                    
                    # Execute ALTER TABLE
                    alter_sql = f"ALTER TABLE {table_name} ADD COLUMN {column.name} {col_type}{constraint_str}"
                    
                    try:
                        conn.execute(text(alter_sql))
                        migrations_executed.append(alter_sql)
                        logging.info(f"Added missing column: {table_name}.{column.name}")
                    except Exception as e:
                        logging.warning(f"Failed to add column {table_name}.{column.name}: {e}")
        
        conn.commit()
    
    return migrations_executed

def generate_agent_tokens():
    """Generate tokens for agents that don't have them."""
    db = SessionLocal()
    try:
        # Find agents without tokens
        agents_without_tokens = db.query(Agent).filter(
            (Agent.token.is_(None)) | (Agent.token == '')
        ).all()
        
        tokens_generated = 0
        for agent in agents_without_tokens:
            # Generate a secure random token
            agent.token = secrets.token_hex(32)  # 64-character hex string
            tokens_generated += 1
            logging.info(f"Generated token for agent: {agent.name} ({agent.id})")
        
        if tokens_generated > 0:
            db.commit()
            print(f"Generated {tokens_generated} agent tokens")
        
        return tokens_generated
        
    except Exception as e:
        db.rollback()
        logging.error(f"Failed to generate agent tokens: {e}")
        return 0
    finally:
        db.close()

def init_db():
    """Create tables, run auto-migration, and generate agent tokens."""
    # First, create any completely new tables
    Base.metadata.create_all(bind=engine)
    
    # Then, run auto-migration for missing columns
    migrations = auto_migrate()
    
    if migrations:
        print(f"Database migration completed. {len(migrations)} columns added:")
        for migration in migrations:
            print(f"  - {migration}")
    else:
        print("Database initialized. No migrations needed.")
    
    # Generate tokens for agents that don't have them
    generate_agent_tokens()
    
    print("Add agents via the Agent Management panel.")

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
