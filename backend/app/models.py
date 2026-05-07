import uuid
from datetime import datetime
from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.database import Base


class Case(Base):
    __tablename__ = "cases"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(256), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    status = Column(String(32), nullable=False, default="draft")
    version = Column(Integer, nullable=False, default=1)
    raw_text = Column(Text, nullable=True)
    chunks = Column(JSONB, nullable=True)
    extraction = Column(JSONB, nullable=True)
    reasoning = Column(JSONB, nullable=True)
    action_plan = Column(JSONB, nullable=True)
    explanation = Column(JSONB, nullable=True)
    review = Column(JSONB, nullable=True)
    run_history = Column(JSONB, nullable=True)


class ExtractionResult(Base):
    __tablename__ = "extraction_results"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, unique=True, nullable=False)
    case_id = Column(Integer, ForeignKey("cases.id"), nullable=False, index=True)
    case_number = Column(Text, nullable=True)
    court_name = Column(Text, nullable=True)
    judgment_date = Column(Date, nullable=True)
    matter_type = Column(Text, nullable=True)
    parties = Column(JSONB, nullable=True)
    directives = Column(JSONB, nullable=True)
    deadlines = Column(JSONB, nullable=True)
    cited_statutes = Column(JSONB, nullable=True)
    summary = Column(Text, nullable=True)
    confidence = Column(JSONB, nullable=True)
    evidence = Column(JSONB, nullable=True)
    version = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class ExtractionChunk(Base):
    __tablename__ = "extraction_chunks"

    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(Integer, ForeignKey("cases.id"), nullable=False, index=True)
    chunk_index = Column(Integer, nullable=False)
    raw_output = Column(JSONB, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
