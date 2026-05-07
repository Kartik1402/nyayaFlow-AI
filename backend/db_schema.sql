-- SQL schema for extraction result storage and optional chunk debug table

CREATE TABLE extraction_results (
    id UUID PRIMARY KEY,
    case_id INTEGER NOT NULL REFERENCES cases(id),
    case_number TEXT,
    court_name TEXT,
    judgment_date DATE,
    matter_type TEXT,
    parties JSONB,
    directives JSONB,
    deadlines JSONB,
    cited_statutes JSONB,
    summary TEXT,
    confidence JSONB,
    evidence JSONB,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE extraction_chunks (
    id SERIAL PRIMARY KEY,
    case_id INTEGER NOT NULL REFERENCES cases(id),
    chunk_index INTEGER NOT NULL,
    raw_output JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
