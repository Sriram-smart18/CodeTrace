# TraceCode Deployment & Configuration Guide

This document describes the step-by-step procedures for provisioning, deploying, and configuration-managing the **TraceCode** ecosystem in local development and production environments.

---

## 1. Database Provisioning & Schema Migration

TraceCode utilizes a PostgreSQL database managed via Supabase. There are two primary options for provisioning the database schema:

### Option A: Local Schema Migrations via Supabase CLI (Recommended)
1. Install the Supabase CLI on your host machine.
2. Link your Supabase CLI to the remote project:
   ```bash
   supabase login
   supabase link --project-ref fnvkthngkbrodsmjbuft
   ```
3. Run migrations sequentially from the `supabase/migrations/` directory:
   ```bash
   supabase db push
   ```
   This will apply all 32 SQL migrations—including tables, indexes, RPC security triggers, and Row Level Security policies.

### Option B: Direct Execution via Supabase SQL Editor
1. Log in to the [Supabase Dashboard](https://supabase.com).
2. Go to the **SQL Editor** panel.
3. Open the file [COMPLETE_MIGRATION.sql](file:///c:/Users/patar/OneDrive/Desktop/Tracecode/COMPLETE_MIGRATION.sql) in your text editor.
4. Copy the entire file contents, paste them into the SQL Editor, and click **Run**.
5. *Note:* Ensure that the final security hardening script [20260605173000_security_hardening.sql](file:///c:/Users/patar/OneDrive/Desktop/Tracecode/supabase/migrations/20260605173000_security_hardening.sql) is also executed to lock down RLS boundaries and define the classroom enrollment join triggers.

---

## 2. Docker & Containerized Deployment

TraceCode can be deployed as a multi-container Docker cluster utilizing `docker-compose`. This ensures proper routing and process isolation for running student code.

### Prerequisites
* [Docker Desktop](https://www.docker.com/) or Docker Engine with Docker Compose installed.

### Service Structure (`docker-compose.yml`)
The cluster exposes two primary services:
1. **Frontend Host**: Nginx hosting the React Single Page Application (PWA). Emits statically compiled HTML/JS bundles on port `80`.
2. **Sandbox execution-server**: Node.js/Express runner operating on port `3001` with local compiler toolchains (Python, Node).

### Build & Deployment Command
From the project root directory, run:
```bash
docker-compose up -d --build
```
This builds both service nodes and runs them in detached background modes.

### Verification URLs
* **Student/Teacher Application**: `http://localhost/`
* **Sandbox Execution API**: `http://localhost:3001/health`

---

## 3. Environment Variable Requirements

Create a `.env` file in the project root containing the following configurations:

```env
# Supabase Project Connection Details
VITE_SUPABASE_URL=https://fnvkthngkbrodsmjbuft.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.your-anon-key-here...

# Execution Server Endpoint (Local or Production domain)
VITE_EXECUTION_SERVER_URL=http://localhost:3001
```

---

## 4. Edge Functions Deployment & AI Secrets

TraceCode relies on three Supabase Edge Functions for grading, code similarity checks, and fraud tracking.

### CLI Deployment Commands
To push edge functions to the live Supabase project instance:
```bash
supabase functions deploy evaluate-submission --use-api --project-ref fnvkthngkbrodsmjbuft
supabase functions deploy check-plagiarism --use-api --project-ref fnvkthngkbrodsmjbuft
supabase functions deploy detect-fraud --use-api --project-ref fnvkthngkbrodsmjbuft
```
*Note:* The `--use-api` flag forces compilation and bundling to occur on Supabase's remote builder server, bypassing local Docker dependencies.

### Secret Environment Settings
You must configure the **OpenRouter API Key** inside your Supabase project so the AI evaluation function can request grading completions:
```bash
supabase secrets set OPENROUTER_API_KEY=sk-or-v1-your-openrouter-key-here
```
This secret will be loaded dynamically by `evaluate-submission` when triggered during submission pipeline runs.

---

## 5. Storage Buckets Setup

To support user profile avatars:
1. Go to the Supabase Dashboard → **Storage**.
2. Create a new storage bucket named **`avatars`**.
3. Set the bucket privacy toggle to **Public** so public URLs can resolve.
4. Set the maximum file size limit to `2MB` to match frontend validation rules.
