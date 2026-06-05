# TraceCode API Reference Specification

This document provides a comprehensive description of the REST interfaces, WebSocket channels, and Supabase Edge Function API endpoints utilized by the **TraceCode** application components.

---

## 1. Sandbox Execution Server REST API

Base URL: `http://localhost:3001` (or local docker endpoint mapped to port 3001).

### A. Server Health & Telemetry Check
* **Route**: `GET /health`
* **Access**: Open (Exempt from auth checks)
* **Response Model (`application/json`)**:
  ```json
  {
    "status": "ok",
    "uptime": 1420.52,
    "activeSessions": 3,
    "metrics": {
      "totalExecutions": 582,
      "totalCompilationFailures": 14,
      "totalTimeouts": 8,
      "totalMemoryExceeded": 3,
      "totalErrors": 25,
      "totalSessionsCreated": 420,
      "averageExecutionTimeMs": 210,
      "restExecutions": 320,
      "socketExecutions": 262,
      "languages": {
        "python": 380,
        "javascript": 202
      }
    }
  }
  ```

### B. Evaluate Code Payload (Synchronous Sandbox)
Used by Supabase Edge Functions for running assignments against test suites.
* **Route**: `POST /execute`
* **Access**: Local network or JWT authorized IP.
* **Request Payload**:
  ```json
  {
    "language": "python",
    "code": "import sys\nval = sys.stdin.read().strip()\nprint(f'Echo: {val}')",
    "input": "hello tracecode",
    "timeLimit": 5,
    "memoryLimit": 256
  }
  ```
* **Response Payload**:
  ```json
  {
    "output": "Echo: hello tracecode\n",
    "hasError": false,
    "exitCode": 0,
    "runTimeMs": 62,
    "peakMemoryKb": 14200
  }
  ```

---

## 2. Interactive Terminal Socket.IO Interface

Used in student editor playgrounds for real-time `xterm.js` terminal interactions. Connection URL: `ws://localhost:3001`.

### Handshake & Authorization
* Sockets must supply a Supabase Auth JWT inside the connection auth options:
  ```javascript
  const socket = io("http://localhost:3001", {
    auth: {
      token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    }
  });
  ```
* Connect middleware verifies the signature, resolves the `user_id`, and blocks connections for revoked/invalid signatures.

### Client-to-Server Channels
* **`join_session`**: Configures listener room boundaries.
  * *Payload*: `"session-uuid"`
* **`run`**: Spawns compile & execute fork session.
  * *Payload*:
    ```json
    {
      "sessionId": "4a1b0200-a548-4cb2-9856-11b0e501a396",
      "language": "javascript",
      "code": "console.log('Running code sandbox');",
      "userId": "student-supabase-uid"
    }
    ```
* **`input`**: Writes text to standard input (`stdin`) buffer of running code.
  * *Payload*:
    ```json
    {
      "sessionId": "4a1b0200-a548-4cb2-9856-11b0e501a396",
      "data": "user response\n"
    }
    ```
* **`stop`**: Sends `SIGKILL` to active sandbox process.
  * *Payload*: `{ "sessionId": "4a1b0200-a548-4cb2-9856-11b0e501a396" }`

### Server-to-Client Channels
* **`status`**: Emits execution state. Values: `"running"`, `"waiting-input"`, `"finished"`, `"killed"`.
* **`output`**: Emits stdout/stderr bytes.
* **`exit`**: Emits exit code when program completes.

---

## 3. Supabase Edge Functions API

Deployed under your project endpoint `https://fnvkthngkbrodsmjbuft.supabase.co/functions/v1/`.

### Authorization Headers
All Edge Functions require the following headers:
```http
Authorization: Bearer <Student_or_Teacher_JWT>
Content-Type: application/json
```
*Note: Operations can bypass token rules if matching the secret `SUPABASE_SERVICE_ROLE_KEY` header for background execution pipelines.*

### A. `/evaluate-submission`
Triggers assignment execution and grading checks.
* **Route**: `POST /evaluate-submission`
* **Access**: Auth user (Enrolled Student).
* **Payload**:
  ```json
  {
    "submissionId": "sub-uuid-here",
    "code": "print('final submission code')",
    "language": "python"
  }
  ```
* **Response**:
  ```json
  {
    "success": true,
    "verdict": "ACCEPTED",
    "score": 100,
    "feedback": "All test cases passed. Excellent styling structure."
  }
  ```

### B. `/check-plagiarism`
Compares code fingerprint with other submissions.
* **Route**: `POST /check-plagiarism`
* **Access**: Deployed pipeline (or admin/teacher bypass).
* **Payload**:
  ```json
  {
    "submissionId": "sub-uuid-here",
    "assignmentId": "asg-uuid-here"
  }
  ```
* **Response**:
  ```json
  {
    "similarityScore": 0.12,
    "isFlagged": false,
    "matchesCount": 0
  }
  ```

### C. `/detect-fraud`
Analyzes keystroke, navigation, and clipboard logs.
* **Route**: `POST /detect-fraud`
* **Access**: Deployed pipeline (or admin/teacher bypass).
* **Payload**:
  ```json
  {
    "submissionId": "sub-uuid-here"
  }
  ```
* **Response**:
  ```json
  {
    "riskLevel": "LOW",
    "indicators": {
      "pasteCount": 0,
      "unusualSpeed": false
    }
  }
  ```
