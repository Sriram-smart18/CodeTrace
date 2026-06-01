# 🖥️ TraceCode

> A full-stack, real-time code execution and assignment management platform built for teachers and students.

TraceCode is a web-based learning platform where teachers can create and monitor coding assignments, and students can write, run, and submit code directly in the browser — with live monitoring, interactive terminals, and real-time feedback.

---

## ✨ Features

### 👨‍🎓 Student Portal
- **Dashboard** — Overview of active assignments, recent submissions, and progress analytics with charts.
- **Code Editor** — Monaco-powered in-browser editor supporting Python and JavaScript with syntax highlighting and autocompletion.
- **Interactive Terminal** — Real-time terminal (`xterm.js`) with `stdin`/`stdout` for interactive programs.
- **Resizable Layouts** — Drag-and-drop resizable panels for custom workspace arrangement.
- **Assignments** — Browse and filter assigned coding tasks.
- **Submissions** — View all past submission history with status tracking and virtualized lists for performance.
- **Project Builder** — Dedicated workspace for multi-file project construction.

### 👩‍🏫 Teacher Portal
- **Dashboard** — Class-wide statistics, recent activity, and submission overview using dynamic charts (`recharts`).
- **Assignment Management** — Create, edit, and manage coding assignments with strict due dates.
- **Student Management** — View enrolled students and monitor their activity.
- **Submission Review** — Browse all submissions per assignment with detailed code diffs and results.
- **Live Monitoring** — Real-time view of students actively working during a session via Supabase Realtime.
- **Live Session Proctoring** — Launch a proctored live coding session with per-assignment tracking and fraud detection.
- **AI-Powered Evaluation** — Automated code evaluation, grading, and feedback generation using Groq (`llama-3.1-8b-instant`).
- **Plagiarism Detection** — Peer similarity checking to ensure academic integrity.
- **Assignment Detail** — Deep-dive analytics per assignment with individual student breakdowns.

### ⚙️ Execution Engine & Infrastructure
- Sandboxed code execution via a dedicated **Node.js execution server**.
- Supports **Python** and **JavaScript** out of the box with Piston API support.
- **Resource limits** enforced per session (monitored via `pidusage`):
  - ⏱️ Absolute timeout: **5 minutes**
  - 💤 Idle timeout: **60 seconds**
  - 💾 Memory limit: **512 MB**
  - 🔥 CPU limit: **95%**
  - 📤 Output limit: **1 MB**
- Real-time I/O streaming over **Socket.IO** (bi-directional communication).
- Interactive `stdin` support for programs requiring user input.
- Automatic cleanup of temp files and processes on disconnect.

### 🎨 UI & UX Highlights
- **Premium Design System** — Built with `shadcn/ui` and Radix UI primitives.
- **Dark Mode Support** — Seamless light/dark theme switching (`next-themes`).
- **Fluid Animations** — Micro-interactions, page transitions, and list animations powered by Framer Motion.
- **Responsive & Accessible** — fully responsive layouts with ARIA-compliant UI components.
- **Command Menu** — Quick navigation via `cmdk` command palette.
- **Rich Notifications** — Toast notifications via `sonner` and `vaul` drawers.

---

## 🛠️ Tech Stack

| Layer | Technology | Description |
|---|---|---|
| **Core Framework** | React 18, TypeScript, Vite | Fast, modern frontend toolchain using the SWC compiler. |
| **State Management** | Zustand, TanStack React Query v5 | Global state management (Zustand) and robust server-state caching (React Query). |
| **Routing** | React Router DOM v6 | Client-side routing with nested routes and role-based guards. |
| **Styling & Theming** | Tailwind CSS v3, `next-themes` | Utility-first styling with comprehensive light/dark mode support. |
| **UI Components** | `shadcn/ui`, Radix UI | Accessible, headless UI primitives including Dialogs, Popovers, Tabs, and Selects. |
| **Icons & Design** | Lucide React | Clean, consistent SVG icon set. |
| **Forms & Validation** | React Hook Form, Zod | Type-safe form handling and schema validation. |
| **Code Editor** | Monaco Editor | The same powerful editor engine that powers VS Code (`@monaco-editor/react`). |
| **Terminal** | `xterm.js`, `@xterm/addon-fit` | Fully featured terminal emulator running directly in the browser. |
| **Real-time Engine** | Socket.IO | Bi-directional, low-latency communication for the execution server and terminal. |
| **Animations** | Framer Motion, `tailwindcss-animate` | Complex layout animations, page transitions, and declarative UI motion. |
| **Data Visualization** | Recharts | Composable charting library for dashboard analytics. |
| **Advanced Layouts** | `react-resizable-panels`, `react-window` | Draggable split-panes and high-performance virtualized lists. |
| **Backend & DB** | Supabase | Managed PostgreSQL, Authentication, Realtime Subscriptions, and Edge Functions. |
| **Execution Server** | Node.js, Express, `pidusage` | Custom execution engine for running untrusted code in isolated processes. |
| **AI Integrations** | Groq (`llama-3.1-8b-instant`) | Fast LLM inference for AI evaluations and code feedback. |
| **Testing** | Vitest, React Testing Library, Playwright | Comprehensive unit, component, and End-to-End testing. |

---

## 📁 Project Structure

```
tracecode/
├── src/
│   ├── pages/
│   │   ├── Index.tsx                  # Landing page
│   │   ├── student/
│   │   │   ├── Login.tsx
│   │   │   ├── Signup.tsx
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Assignments.tsx
│   │   │   ├── Editor.tsx             # Monaco editor + terminal
│   │   │   ├── ProjectBuilder.tsx
│   │   │   └── Submissions.tsx
│   │   └── teacher/
│   │       ├── Login.tsx
│   │       ├── Signup.tsx
│   │       ├── Dashboard.tsx
│   │       ├── Students.tsx
│   │       ├── Assignments.tsx
│   │       ├── AssignmentDetail.tsx
│   │       ├── Submissions.tsx
│   │       ├── Monitoring.tsx
│   │       └── LiveSession.tsx
│   ├── components/
│   │   ├── ProtectedRoute.tsx         # Role-based route guard
│   │   ├── DashboardLayout.tsx
│   │   ├── StudentSidebar.tsx
│   │   ├── TeacherSidebar.tsx
│   │   ├── NavLink.tsx
│   │   ├── monitoring/                # Live monitoring components
│   │   └── ui/                        # shadcn/ui components
│   ├── contexts/
│   │   └── AuthContext.tsx            # Auth state (Supabase)
│   ├── hooks/                         # Custom React hooks
│   ├── integrations/                  # Supabase client & types
│   └── lib/                           # Utility functions
├── execution-server/
│   ├── server.js                      # Socket.IO execution server
│   └── package.json
├── supabase/
│   ├── config.toml
│   ├── functions/                     # Edge functions
│   └── migrations/                    # Database migrations
├── public/
├── index.html
├── vite.config.ts
├── tailwind.config.ts
└── .env                               # Environment variables (see setup)
```

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- A [Supabase](https://supabase.com/) project
- Python (if testing Python code execution locally)

### 1. Clone & Install

```bash
git clone <your-repo-url>
cd tracecode
npm install
```

### 2. Configure Environment Variables

Create a `.env` file in the project root (copy from `.env.example` if available):

```env
VITE_SUPABASE_URL=https://fnvkthngkbrodsmjbuft.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-jwt-key>
VITE_SUPABASE_PUBLISHABLE_KEY=<your-publishable-key-optional>
```

### 3. Deploy Edge Functions (required for AI Evaluate)

Active project: `fnvkthngkbrodsmjbuft`

```bash
supabase login
supabase link --project-ref fnvkthngkbrodsmjbuft
./deploy-edge-functions.ps1
```

Set the **Groq** API secret (Supabase Dashboard → Edge Functions → Secrets, or CLI):

```bash
supabase secrets set GROQ_API_KEY=gsk_your_groq_key
```

Groq uses model `llama-3.1-8b-instant` at `https://api.groq.com/openai/v1/chat/completions` with `response_format: json_object` (plain JSON, no tool calling).

Functions deployed:

| Function | Purpose |
|----------|---------|
| `evaluate-submission` | Teacher **AI Evaluate** (main pipeline) |
| `check-plagiarism` | Peer similarity (triggered after evaluate) |
| `detect-fraud` | Live session fraud scan |
| `execute-code` | Code execution via Piston |

### 4. Start the Execution Server

The execution server handles real-time code running. Start it separately:

```bash
cd execution-server
npm install
node server.js
```

The server runs on **port 3001** by default.

### 5. Start the Frontend Dev Server

```bash
# From the root directory
npm run dev
```

The app will be available at `http://localhost:5173` (or the port Vite assigns).

### 6. Start via Docker Compose (Recommended for Production / Local Sandboxing)

You can launch the complete, containerized TraceCode ecosystem using:

```bash
# Build and run all services (frontend + execution sandbox)
docker-compose up --build
```
* **Frontend SPA client**: Available at `http://localhost` (mapped to port 80).
* **Execution Server**: Available at `http://localhost:3001` (mapped to port 3001).

---

## 📖 Release Documentation

For complete administrative setup and guides, see:
* 🌐 **[System Architecture Reference](file:///c:/Users/patar/OneDrive/Desktop/Tracecode/Architecture.md)** — Architectural design, sandboxing rules, and database policies.
* 👩‍🏫 **[Teacher Portal Guide](file:///c:/Users/patar/OneDrive/Desktop/Tracecode/TeacherGuide.md)** — Assignment setup, hidden test configurations, and proctoring.
* 👨‍🎓 **[Student Portal Guide](file:///c:/Users/patar/OneDrive/Desktop/Tracecode/StudentGuide.md)** — Monaco workflow, terminal usage, and submissions.
* 🔌 **[API endpoints Specification](file:///c:/Users/patar/OneDrive/Desktop/Tracecode/API.md)** — Socket.IO channel listeners and JSON payload definitions.
* 💾 **[Backup & Retention Policies](file:///c:/Users/patar/OneDrive/Desktop/Tracecode/BackupStrategy.md)** — SQL cron backup routines and metric database sweeps.

---

## 🧪 Testing

```bash
# Unit tests (Vitest)
npm run test

# Watch mode
npm run test:watch

# E2E tests (Playwright)
npx playwright test
```

---

## 📦 Build for Production

```bash
npm run build
```

Output is placed in the `dist/` directory.

---

## 🔐 Authentication & Roles

Authentication is handled by **Supabase Auth**. The platform supports two distinct roles:

| Role | Access |
|---|---|
| `student` | Editor, Assignments, Submissions, Project Builder |
| `teacher` | Full dashboard, Assignment management, Live monitoring |

Routes are protected via the `ProtectedRoute` component which checks both authentication state and the user's assigned role.

---

## ⚠️ Environment & Security Notes

- Never commit your `.env` file — it's listed in `.gitignore`
- The execution server runs user code inside spawned child processes inside the Docker container securely isolated as an unprivileged user.
- Resource limits (memory, CPU, timeout) are enforced server-side and cannot be bypassed by the client.

---

## 📄 License

This project is private. All rights reserved.
