# 🖥️ TraceCode

> A secure, real-time code execution, proctoring, and assignment management platform built for modern CS classrooms.

TraceCode is a Progressive Web App (PWA) where students can write, test, and submit coding challenges in a Monaco-powered IDE, while teachers monitor student work live with telemetry analytics, anti-fraud alerts, AST similarity checks, and AI grading.

---

## ✨ Primary Features

### 👨‍🎓 Student Workspace
* **Interactive Monaco IDE** — Standard autocomplete, syntax highlighting, and dynamic layout scaling (HTML, CSS, JS, Python).
* **xterm.js Console Terminal** — Bi-directional WebSocket communication for running code and handling standard input (`stdin`) streams.
* **History Rollbacks** — Restore past submission code snapshots with a single click.
* **Leaderboards** — Class-wide rankings sorted by score, execution speed, and accepted timestamps.
* **Offline Protection Overlay** — Floating network monitor disables submissions and AI calls during disconnects.

### 👩‍🏫 Teacher Proctoring Portal
* **Live Session Proctoring** — Real-time telemetry feed tracking typing speed, executes, and copy-pastes.
* **Bi-directional Live Stream** — Access and view any student's active workspace code *live* in a read-only editor.
* **Anti-Fraud & Paste Analytics** — Logs pasted characters, lines, and blocks. Renders Low/Medium/High risk alerts for suspicious clipboard activity.
* **OpenRouter AI Evaluations** — Asynchronous code styling, readability, and performance analysis.
* **Plagiarism Winnowing Engine** — AST fingerprinting to detect peer-to-peer code similarities.

---

## 🛠️ Technology Stack

| Layer | Technologies |
|---|---|
| **Frontend Framework** | React 18, Vite (SWC), TypeScript, Tailwind CSS, `next-themes` |
| **State & Querying** | Zustand, TanStack React Query v5 |
| **IDE & Terminal** | Monaco Editor, `xterm.js` |
| **Backend Service** | Supabase (PostgreSQL, Realtime, Auth, Storage) |
| **Execution Sandboxes**| Node.js, Express, Socket.IO, `pidusage` |
| **AI completions** | OpenRouter (`openai/gpt-oss-20b:free` + fallbacks) |
| **PWA Services** | Workbox (generateSW) |

---

## 📁 System Documents Directory

* 🌐 **[System Architecture](file:///c:/Users/patar/OneDrive/Desktop/Tracecode/Architecture.md)** — Architectural design, telemetry sequences, RLS databases, and PWA configurations.
* 🚀 **[Deployment Guide](file:///c:/Users/patar/OneDrive/Desktop/Tracecode/Deployment.md)** — Step-by-step setup for local Docker Compose, SQL migrations, and Edge Functions.
* 👩‍🏫 **[Teacher Portal Manual](file:///c:/Users/patar/OneDrive/Desktop/Tracecode/TeacherGuide.md)** — Setting up test cases, monitoring copy-pastes, and managing grading.
* 👨‍🎓 **[Student Portal Manual](file:///c:/Users/patar/OneDrive/Desktop/Tracecode/StudentGuide.md)** — Sandboxed runs, terminal stdin, and code rollbacks.
* 🔌 **[API Specification](file:///c:/Users/patar/OneDrive/Desktop/Tracecode/APIOverview.md)** — Details REST routes, Socket.IO bi-directional channels, and Edge Function payloads.

---

## 🚀 Getting Started (Quick Start)

### 1. Installation
```bash
git clone <repository-url>
cd tracecode
npm install
```

### 2. Sandbox Setup & Run
To compile and execute user code locally, spin up the Socket.IO server:
```bash
cd execution-server
npm install
node server.js
```

### 3. Application Dev Server
Set up your `.env` variables (see [Deployment Guide](file:///c:/Users/patar/OneDrive/Desktop/Tracecode/Deployment.md) for details) and run:
```bash
# In the project root
npm run dev
```
Open `http://localhost:5173` in your browser.

---

## 🐳 Docker Deployment (Recommended)

To run the complete system (Frontend SPA + Nginx server + Sandboxed Execution Runner) containerized:
```bash
docker-compose up -d --build
```
* Access Frontend SPA: `http://localhost/`
* Access Execution API: `http://localhost:3001/health`
