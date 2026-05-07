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

## Production Deployment

### Frontend (Vercel)

1. Deploy the `frontend` folder as a Vercel project.
2. Set the build command to:
   ```bash
   npm install && npm run build
   ```
3. Set the output directory to:
   ```text
   dist
   ```
4. Add the environment variable:
   ```text
   VITE_API_BASE_URL=https://<your-backend-url>
   ```
5. Use `frontend/vercel.json` to ensure SPA rewrites for routes like `/cases`, `/cases/:id`, and `/verified`.

### Backend (Render)

1. Deploy the backend using Render as a Python web service.
2. Use `render.yaml` in the repo root or configure the service manually.
3. Set the build command to:
   ```bash
   pip install -r backend/requirements.txt
   ```
4. Set the start command to:
   ```bash
   uvicorn app.main:app --host 0.0.0.0 --port $PORT
   ```
5. Configure environment variables on Render:
   - `DATABASE_URL`
   - `OPENAI_API_KEY`
   - `LLM_PROVIDER`
   - `LLM_MODEL`
   - `LLM_BASE_URL`
   - `ALLOWED_ORIGINS`
   - `UPLOADS_DIR`

### Database

Use a managed PostgreSQL provider such as Neon or Supabase. Set `DATABASE_URL` with the provider connection string.

### Deployment architecture

- Frontend
  - Hosted on Vercel
  - Uses `VITE_API_BASE_URL` to communicate with backend APIs
  - SPA routing handled by `frontend/vercel.json`
- Backend
  - Hosted on Render
  - Serves FastAPI endpoints and AI pipeline
  - Uses PostgreSQL for persistence and `backend/uploads` for temporary file storage
- Database
  - Hosted as Neon or Supabase PostgreSQL

### API Endpoints

- `POST /upload-case` — upload PDF or text file
- `GET /cases` — list cases
- `GET /cases/:id` — get case detail
- `POST /cases/:id/process` — run AI processing pipeline
- `POST /cases/:id/review` — approve/reject/edit review action
- `POST /cases/:id/reprocess` — reprocess case stages
- `POST /review/approve` — approve by case ID
- `POST /review/reject` — reject by case ID
- `POST /reprocess` — reprocess by case ID
- `GET /health` — health check

### Environment Variables

Frontend:

```text
VITE_API_BASE_URL=https://<your-backend-url>
```

Backend:

```text
DATABASE_URL=postgresql+psycopg2://<user>:<pass>@<host>:<port>/<db>
OPENAI_API_KEY=...
LLM_PROVIDER=mistral
LLM_MODEL=mistral-small-latest
LLM_API_KEY=...
LLM_BASE_URL=https://api.mistral.ai/v1/chat/completions
ALLOWED_ORIGINS=https://<your-frontend-url>
UPLOADS_DIR=uploads
```

### Production build commands

Frontend:
```bash
cd frontend
npm install
npm run build
```

Backend:
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

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
