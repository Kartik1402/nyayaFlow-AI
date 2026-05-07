# Court Judgments → Verified Action Plans System

This repository implements a complete AI-powered pipeline for extracting court judgment directives, reasoning about administrative action, generating action plans, explaining decisions, and enforcing human verification before final dashboard publication.

## Architecture

- Backend: FastAPI + PostgreSQL
- Frontend: React + Vite
- Core pipeline stages:
  1. PDF / text upload
  2. Document chunking
  3. Extraction agent
  4. Reasoning agent
  5. Action plan agent
  6. Explanation agent
  7. Human review
  8. Verified dashboard output

## Install and Run

### 1. Backend

From the repository root:

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

Create or export environment variables in `backend/.env` or your shell:

```text
DATABASE_URL=postgresql+psycopg2://postgres:postgres@localhost:5432/courtcases
OPENAI_API_KEY=your_openai_api_key
```

Start the backend API:

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 2. Frontend

From the repository root:

```bash
cd frontend
npm install
npm run dev
```

Then open `http://localhost:5173` in your browser.

## Backend

### Setup

1. Create a Python environment inside `backend`:
   ```bash
   cd backend
   python -m venv .venv
   .venv\Scripts\activate
   pip install -r requirements.txt
   ```

2. Configure PostgreSQL in `.env` or environment:
   ```text
   DATABASE_URL=postgresql+psycopg2://postgres:postgres@localhost:5432/courtcases
   OPENAI_API_KEY=your_openai_api_key
   ```

3. Start the API:
   ```bash
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

## Frontend

### Setup

1. Install dependencies:
   ```bash
   cd frontend
   npm install
   ```

2. Start the app:
   ```bash
   npm run dev
   ```

3. Open `http://localhost:5173`

## Workflow

- Upload a judgment PDF
- Review extracted case data, reasoning, plan, and explanation
- Approve, edit, or reject
- Only approved cases appear in the verified dashboard

## Notes

- The backend uses LangChain for LLM calls and can support multiple providers.
- If no `LLM_PROVIDER` is set, the system defaults to `openai`.
- If PDF parsing is needed, `PyMuPDF` is installed.
- The system preserves all enrichment stages and supports reprocessing after rejection.
- A PowerShell Podman setup script is available at `podman-setup.ps1`.

## Podman PostgreSQL + pgAdmin Setup

1. Run the script from the repository root:
   ```powershell
   .\podman-setup.ps1
   ```
2. PostgreSQL will be exposed on host port `15432`.
3. pgAdmin will be exposed on host port `15443`.
4. Login to pgAdmin using:
   - Email: `admin@example.com`
   - Password: `admin`
5. Add a server in pgAdmin with:
   - Host: `host.docker.internal` or `localhost`
   - Port: `15432`
   - Username: `postgres`
   - Password: `postgres`
   - Maintenance DB: `courtcases`
