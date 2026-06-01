# TraceCode API Specification

This document details the API endpoints, REST structures, and Socket.IO events used for communication between TraceCode services.

---

## 1. Execution Server REST endpoints

Default Base URL: `http://localhost:3001` (or production endpoint mapped in Compose).

### A. Health Check
* **Route**: `GET /health`
* **Rate Limits**: Exempt from rate-limiting middleware.
* **Response Output (`application/json`)**:
```json
{
  "status": "ok",
  "uptime": 128.52,
  "activeSessions": 2,
  "metrics": {
    "totalExecutions": 240,
    "totalCompilationFailures": 12,
    "totalTimeouts": 4,
    "totalMemoryExceeded": 2,
    "totalErrors": 15,
    "totalSessionsCreated": 240,
    "averageExecutionTimeMs": 285,
    "restExecutions": 140,
    "socketExecutions": 100,
    "languages": {
      "python": 180,
      "javascript": 60
    }
  }
}
```

### B. Evaluate Code (Static Run)
Used by Supabase Edge Functions for grading runs.
* **Route**: `POST /execute`
* **Rate Limits**: 20 requests/minute per client IP.
* **Payload parameters**:
```json
{
  "language": "python",
  "code": "print(input())",
  "input": "test input",
  "timeLimit": 5,
  "memoryLimit": 256
}
```
* **Success Output (`application/json`)**:
```json
{
  "output": "test input\n",
  "hasError": false,
  "exitCode": 0,
  "runTimeMs": 48,
  "peakMemoryKb": 12400
}
```

---

## 2. Socket.IO Communication channels (Playground Runs)

Interactive playground connections route to `http://localhost:3001` over websockets.

### Client-to-Server Events

#### `join_session`
Registers a client connection to a specific isolated room.
* **Payload**: `sessionId` (String - strict UUID pattern)

#### `run`
Spawns an interactive code process inside the container.
* **Payload**:
```json
{
  "sessionId": "e674da38-a28a-40a2-aa59-8664426543b1",
  "language": "javascript",
  "code": "console.log('Running code');",
  "userId": "auth-user-id"
}
```

#### `input`
Writes characters to the standard input of the active process.
* **Payload**:
```json
{
  "sessionId": "e674da38-a28a-40a2-aa59-8664426543b1",
  "data": "10\n"
}
```

#### `stop`
Kills the running spawned process.

---

### Server-to-Client Events

* **`status`**: Emits state transitions (`running`, `waiting-input`, `finished`, `killed`).
* **`output`**: Streams string stdout/stderr buffers.
* **`exit`**: Emits exit code (`code` as Integer) when process terminates.
