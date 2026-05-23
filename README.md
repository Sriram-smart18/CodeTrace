# 🖥️ TraceCode

> A full-stack, real-time code execution and assignment management platform built for teachers and students.

TraceCode is a web-based learning platform where teachers can create and monitor coding assignments, and students can write, run, and submit code directly in the browser — with live monitoring, interactive terminals, and real-time feedback.

---

## ✨ Features

### 👨‍🎓 Student Portal
- **Dashboard** — Overview of active assignments, recent submissions, and progress
- **Code Editor** — Monaco-powered in-browser editor supporting Python and JavaScript
- **Interactive Terminal** — Real-time terminal (xterm.js) with stdin/stdout for interactive programs
- **Assignments** — Browse and filter assigned coding tasks
- **Submissions** — View all past submission history with status tracking
- **Project Builder** — Dedicated workspace for multi-file project construction

### 👩‍🏫 Teacher Portal
- **Dashboard** — Class-wide statistics, recent activity, and submission overview
- **Assignment Management** — Create, edit, and manage coding assignments with due dates
- **Student Management** — View enrolled students and their activity
- **Submission Review** — Browse all submissions per assignment with code diffs and results
- **Live Monitoring** — Real-time view of students actively working during a session
- **Live Session** — Launch a proctored live coding session with per-assignment tracking
- **Assignment Detail** — Deep-dive analytics per assignment with individual student breakdowns

### ⚙️ Execution Engine
- Sandboxed code execution via a dedicated **Node.js execution server**
- Supports **Python** and **JavaScript** out of the box
- **Resource limits** enforced per session:
  - ⏱️ Absolute timeout: **5 minutes**
  - 💤 Idle timeout: **60 seconds**
  - 💾 Memory limit: **512 MB**
  - 🔥 CPU limit: **95%**
  - 📤 Output limit: **1 MB**
- Real-time I/O streaming over **Socket.IO**
- Interactive `stdin` support for programs requiring user input
- Automatic cleanup of temp files and processes on disconnect

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18, TypeScript, Vite |
| **UI Library** | shadcn/ui (Radix UI primitives) |
| **Styling** | Tailwind CSS v3 |
| **Routing** | React Router DOM v6 |
| **State / Data** | TanStack React Query v5 |
| **Code Editor** | Monaco Editor (`@monaco-editor/react`) |
| **Terminal** | xterm.js + xterm-addon-fit |
| **Animations** | Framer Motion |
| **Backend / Auth / DB** | Supabase (Auth + PostgreSQL + Realtime) |
| **Execution Server** | Node.js + Express + Socket.IO |
| **Forms** | React Hook Form + Zod |
| **Testing** | Vitest + Testing Library + Playwright |

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
VITE_SUPABASE_URL=https://<your-project>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
```

### 3. Start the Execution Server

The execution server handles real-time code running. Start it separately:

```bash
cd execution-server
npm install
node server.js
```

The server runs on **port 3001** by default.

### 4. Start the Frontend Dev Server

```bash
# From the root directory
npm run dev
```

The app will be available at `http://localhost:5173` (or the port Vite assigns).

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
- The execution server runs user code in child processes. For production, consider running it inside a container (Docker) with additional OS-level sandboxing
- Resource limits (memory, CPU, timeout) are enforced server-side and cannot be bypassed by the client

---

## 📄 License

This project is private. All rights reserved.
