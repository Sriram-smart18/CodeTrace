# TraceCode Student Guide

This guide explains how to write code, test programs, restore past versions, and track rankings in the TraceCode Coding Platform.

---

## 1. Workspace Layout & Editor Controls

When you open an assignment workspace, you will see three resizable panels:
* **Challenge Details (Left)**: Contains the problem description, constraints, and public sample input/output examples.
* **Monaco Editor (Center)**: Features VS-Code level auto-completion, syntax coloring, auto-indentation, and font settings. Use the language selector to switch runtimes (e.g. Python, JavaScript).
* **Terminal Console (Bottom)**: Renders code outputs, standard error messages, and interactive input streams.

*Note:* You can customize your layout by dragging the split borders to resize the workspace.

---

## 2. Testing & Running Programs

You can run and test code before submitting it for grading:

### Interactive Run Console
1. Write your solution in the Monaco editor.
2. Click the **RUN** button.
3. Your code is compiled/executed in a sandboxed container.
4. If your program asks for user input (e.g. `input()` in Python or `readline` in Node), the terminal switches to **waiting-input** mode.
5. Click inside the terminal console, type your inputs, and press **Enter** to stream it to standard input (`stdin`).
6. If your program loops indefinitely or hangs, click **STOP** to safely terminate the running process.

---

## 3. Submissions & Rollback History

To submit code for grading:
1. Click the **SUBMIT** button.
2. Your program is evaluated against the full test suite (both public and hidden test cases).
3. The **Test Results** tab displays the test outcomes:
   * Public test cases show input details and comparison logs on failure.
   * Hidden test cases show matching scores and durations without exposing the test parameters.
4. Go to the **History Tab** on the left to see all your past submissions.
5. If you want to undo changes or recover previous work, select a previous submission and click **Load Code** to load that snapshot back into your active editor.

---

## 4. Leaderboard Ranking Rules

Your classroom leaderboard tracks performance for each assignment. Tie-breaker rules sort rankings by:
1. **Score** (Highest score first).
2. **Execution Time** (Lowest runtime in milliseconds first).
3. **Accepted Timestamp** (Earliest successful submission first).

---

## 5. PWA Installation & Offline Protection

### Installing the App
TraceCode is an installable Progressive Web App (PWA). If your browser is compatible (Chrome, Edge, Safari):
1. An **Install App** button will appear in the top-right header layout.
2. Click the button to add TraceCode to your desktop or mobile app drawer.
3. Once installed, TraceCode runs in a standalone window, removing browser URL frames.

### Offline Protection Overlay
If your internet connection drops:
* A floating offline warning banner will appear.
* To protect grade integrity, code executions, AI reviews, and final submissions are disabled while you are offline.
* Typing and workspace editing remain active. Live synchronization and database saving will resume automatically once your connection is restored.
