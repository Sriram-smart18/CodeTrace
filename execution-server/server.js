const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { spawn, execSync, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const pidusage = require('pidusage');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  pingInterval: 15000,
  pingTimeout: 5000,
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// Inline .env file loader helper (CommonJS fallback)
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  try {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const parts = trimmed.split('=');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const val = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
        process.env[key] = val;
      }
    });
  } catch (err) {
    console.error('Failed to parse .env configurations', err);
  }
}

// Validate critical environment variables
const startupSupabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const startupSupabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const startupSupabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log("[STARTUP VALIDATION] Checking Supabase Environment Variables:");
console.log(`- SUPABASE_URL: ${startupSupabaseUrl ? "PRESENT" : "MISSING"} (Length: ${startupSupabaseUrl ? startupSupabaseUrl.length : 0})`);
console.log(`- SUPABASE_ANON_KEY: ${startupSupabaseAnonKey ? "PRESENT" : "MISSING"} (Length: ${startupSupabaseAnonKey ? startupSupabaseAnonKey.length : 0})`);
console.log(`- SUPABASE_SERVICE_ROLE_KEY: ${startupSupabaseServiceKey ? "PRESENT" : "MISSING"} (Length: ${startupSupabaseServiceKey ? startupSupabaseServiceKey.length : 0})`);
if (!startupSupabaseUrl || !startupSupabaseAnonKey) {
  console.warn("[STARTUP VALIDATION] WARNING: Supabase URL or Anon Key is missing. Socket authentication will fail!");
} else {
  console.log("[STARTUP VALIDATION] Supabase environment verified.");
}

// Configurable limits from Environment Variables
const MAX_MEMORY_MB = parseInt(process.env.MAX_MEMORY_MB) || 256;
const MAX_OUTPUT_BYTES = (parseInt(process.env.MAX_OUTPUT_MB) || 5) * 1024 * 1024;
const MAX_CPU_TIMEOUT_MS = parseInt(process.env.MAX_CPU_TIMEOUT_MS) || 10000; // 10s CPU timeout
const MAX_WALL_TIMEOUT_MS = parseInt(process.env.MAX_WALL_TIMEOUT_MS) || 30000; // 30s Wall Clock timeout
const RATE_LIMIT_PER_MINUTE = parseInt(process.env.RATE_LIMIT_PER_MINUTE) || 20;

const logSession = (sessionId, message) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [Session: ${sessionId}] ${message}`);
};
const TEMP_DIR = path.join(__dirname, 'temp');
console.log("TEMP_DIR:", TEMP_DIR);
try {
  fs.accessSync(TEMP_DIR, fs.constants.W_OK);
  console.log("Writable: true");
} catch (err) {
  console.error("Writable: false (Error: " + err.message + ")");
}
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR);

const getExecutablePath = (cmd) => {
  try {
    const whichCmd = process.platform === 'win32' ? 'where' : 'which';
    return execSync(`${whichCmd} ${cmd}`).toString().trim();
  } catch (err) {
    return 'not found';
  }
};
console.log("Python path:", getExecutablePath('python'));
console.log("Java path:", getExecutablePath('java'));
console.log("GCC path:", getExecutablePath('gcc'));
console.log("G++ path:", getExecutablePath('g++'));
console.log("Go path:", getExecutablePath('go'));

const sessions = new Map();
const rateLimits = new Map(); // identifier -> { userId, timestamp, count }
let activeExecutionsCount = 0;
const MAX_CONCURRENT_RUNS = parseInt(process.env.MAX_CONCURRENT_RUNS) || 15;

const ALLOWED_LANGUAGES = ['javascript', 'python', 'java', 'c', 'cpp', 'go', 'html'];

// Global Telemetry Metrics
const metrics = {
  totalExecutions: 0,
  totalCompilationFailures: 0,
  totalTimeouts: 0,
  totalMemoryExceeded: 0,
  totalErrors: 0,
  totalSessionsCreated: 0,
  averageExecutionTimeMs: 0,
  restExecutions: 0,
  socketExecutions: 0,
  languages: {}
};

const recordExecutionStart = (isRest, language) => {
  metrics.totalExecutions++;
  metrics.totalSessionsCreated++;
  if (isRest) {
    metrics.restExecutions++;
  } else {
    metrics.socketExecutions++;
  }
  if (language) {
    metrics.languages[language] = (metrics.languages[language] || 0) + 1;
  }
};

const recordExecutionTime = (duration) => {
  const count = metrics.totalExecutions;
  if (count === 1) {
    metrics.averageExecutionTimeMs = duration;
  } else {
    metrics.averageExecutionTimeMs = Math.round((metrics.averageExecutionTimeMs * (count - 1) + duration) / count);
  }
};

// Express REST Rate Limiter middleware
const restLimiter = (req, res, next) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'anonymous';
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: `Too many requests. Limit: ${RATE_LIMIT_PER_MINUTE} calls/minute.` });
  }
  next();
};

// Structured user/IP rate limiter helper
const isRateLimited = (identifier) => {
  const now = Date.now();
  if (!rateLimits.has(identifier)) {
    rateLimits.set(identifier, { userId: identifier, timestamp: now, count: 1 });
    return false;
  }
  const entry = rateLimits.get(identifier);
  if (now - entry.timestamp > 60000) {
    // Reset window
    entry.timestamp = now;
    entry.count = 1;
    rateLimits.set(identifier, entry);
    return false;
  }
  if (entry.count >= RATE_LIMIT_PER_MINUTE) {
    return true;
  }
  entry.count++;
  rateLimits.set(identifier, entry);
  return false;
};

// ─── Language execution config ────────────────────────────────────────────────

const getExtension = (language) => {
  switch (language) {
    case 'python': return '.py';
    case 'javascript': return '.js';
    case 'c': return '.c';
    case 'cpp': return '.cpp';
    case 'java': return '.java';
    case 'go': return '.go';
    default: return '.txt';
  }
};

const getFileName = (language, code) => {
  if (language === 'java') {
    const match = code.match(/\bpublic\s+class\s+([A-Za-z_][A-Za-z0-9_]*)\b/);
    const className = (match && match[1]) ? match[1] : 'Main';
    return `${className}.java`;
  }
  return `prog_${uuidv4()}${getExtension(language)}`;
};

const getExecutionConfig = (language, filePath, sessionDir) => {
  switch (language) {
    case 'python':
      return { cmd: 'python', args: ['-u', filePath] };

    case 'javascript':
      return { cmd: 'node', args: [filePath] };

    case 'java': {
      const className = path.basename(filePath, '.java');
      const fileName = path.basename(filePath);
      
      console.log('[JAVA EXECUTION LOG]');
      console.log(`- Extracted class name: ${className}`);
      console.log(`- Generated filename: ${fileName}`);
      console.log(`- Compile command: javac ${filePath}`);
      console.log(`- Run command: java -cp ${sessionDir} ${className}`);

      return {
        compileCmd: 'javac',
        compileArgs: [filePath],
        cmd: 'java',
        args: ['-cp', sessionDir, className],
      };
    }

    case 'c': {
      const outFile = path.join(sessionDir, 'prog_c');
      return {
        compileCmd: 'gcc',
        compileArgs: [filePath, '-o', outFile, '-lm'],
        cmd: outFile,
        args: [],
      };
    }

    case 'cpp': {
      const outFile = path.join(sessionDir, 'prog_cpp');
      return {
        compileCmd: 'g++',
        compileArgs: [filePath, '-o', outFile, '-std=c++17'],
        cmd: outFile,
        args: [],
      };
    }

    case 'go':
      return { cmd: 'go', args: ['run', filePath] };

    default:
      throw new Error(`Unsupported language: ${language}`);
  }
};

// ─── Session cleanup ──────────────────────────────────────────────────────────

const cleanupSession = (sessionId) => {
  const session = sessions.get(sessionId);
  if (!session) return;

  logSession(sessionId, 'Cleaning up session');

  if (session.active) {
    activeExecutionsCount = Math.max(0, activeExecutionsCount - 1);
    session.active = false;
  }

  if (session.process && !session.process.killed) {
    try {
      if (process.platform === 'win32') {
        exec(`taskkill /pid ${session.process.pid} /t /f`, (err) => {
          if (err) logSession(sessionId, `taskkill error: ${err.message}`);
        });
      } else {
        try {
          process.kill(-session.process.pid, 'SIGKILL');
        } catch (killErr) {
          session.process.kill('SIGKILL');
        }
      }
    } catch (e) {
      logSession(sessionId, `Process kill error: ${e.message}`);
    }
  }

  ['absoluteTimeout', 'wallTimeout', 'idleTimeout', 'waitingInputTimer', 'monitorInterval', 'disconnectTimer'].forEach((key) => {
    if (session[key]) {
      key === 'monitorInterval' ? clearInterval(session[key]) : clearTimeout(session[key]);
    }
  });

  const dirToDelete = session.sessionDir;
  sessions.delete(sessionId);

  if (dirToDelete) {
    setTimeout(() => {
      try {
        if (fs.existsSync(dirToDelete)) {
          fs.rmSync(dirToDelete, { recursive: true, force: true });
          logSession(sessionId, `Deleted directory ${dirToDelete}`);
        }
      } catch (e) {
        logSession(sessionId, `Failed to delete session dir ${dirToDelete}: ${e.message}`);
      }
    }, 2000);
  }
};

const emitStatus = (sessionId, status) => {
  const session = sessions.get(sessionId);
  if (session && session.status !== status) {
    session.status = status;
    io.to(sessionId).emit('status', status);
  }
};

// ─── Socket.IO handlers ───────────────────────────────────────────────────────

// Token verification helper using Supabase auth endpoint
const verifyToken = async (token) => {
  try {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey) {
      console.error('[SOCKET AUTH] Missing Supabase environment configuration. Cannot verify token.');
      return null;
    }

    const tokenLength = token ? token.length : 0;
    const tokenHint = token ? `${token.substring(0, 8)}...${token.substring(token.length - 8)}` : 'null';
    console.log(`[SOCKET AUTH] Verifying token of length ${tokenLength} (hint: ${tokenHint})`);

    const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        'apikey': anonKey,
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      let errorDetail = '';
      try {
        const errJson = await response.json();
        errorDetail = JSON.stringify(errJson);
      } catch (parseErr) {
        errorDetail = await response.text();
      }
      console.error(`[SOCKET AUTH] Auth endpoint verification failed. Status: ${response.status} ${response.statusText}. Detail: ${errorDetail}`);
      return null;
    }

    const user = await response.json();
    console.log(`[SOCKET AUTH] Verification successful. Decoded user ID: ${user.id}`);
    return user;
  } catch (err) {
    console.error('[SOCKET AUTH] Token verification exception:', err);
    return null;
  }
};

// Check if user has permission to the assignment using Supabase RLS
const checkAssignmentPermission = async (token, assignmentId) => {
  try {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey) {
      console.error('[SOCKET AUTH] Missing Supabase environment configuration. Cannot check assignment permission.');
      return false;
    }

    console.log(`[SOCKET AUTH] Checking assignment permission for Assignment: ${assignmentId}`);

    const response = await fetch(`${supabaseUrl}/rest/v1/assignments?id=eq.${assignmentId}&select=id`, {
      headers: {
        'apikey': anonKey,
        'Authorization': `Bearer ${token}`
      }
    });
    if (!response.ok) {
      let errorDetail = '';
      try {
        const errJson = await response.json();
        errorDetail = JSON.stringify(errJson);
      } catch (parseErr) {
        errorDetail = await response.text();
      }
      console.error(`[SOCKET AUTH] Assignment permission check failed. Status: ${response.status} ${response.statusText}. Detail: ${errorDetail}`);
      return false;
    }
    const list = await response.json();
    const hasAccess = list.length > 0;
    console.log(`[SOCKET AUTH] Assignment permission check result: ${hasAccess ? 'GRANTED' : 'DENIED'}`);
    return hasAccess;
  } catch (err) {
    console.error('[SOCKET AUTH] Assignment permission check exception:', err);
    return false;
  }
};

// Socket.IO Authentication Middleware
io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) {
    console.error('[SOCKET AUTH] Connection rejected: Missing token');
    return next(new Error('Authentication token required'));
  }
  
  const user = await verifyToken(token);
  if (!user) {
    console.error('[SOCKET AUTH] Connection rejected: Invalid token');
    return next(new Error('Invalid authentication token'));
  }

  socket.userId = user.id;
  socket.token = token;
  console.log(`[SOCKET AUTH] Socket connection authenticated for user: ${user.id}`);
  next();
});

io.on('connection', (socket) => {
  console.log(`[SOCKET CONNECT] Client connected: ${socket.id} (user: ${socket.userId})`);

  socket.on('join_session', (sessionId) => {
    socket.join(sessionId);
    socket.sessionId = sessionId;
    const session = sessions.get(sessionId);
    if (session) {
      if (session.disconnectTimer) {
        clearTimeout(session.disconnectTimer);
        session.disconnectTimer = null;
      }
      socket.emit('status', session.status);
    }
  });

  // Live monitoring room joining with authorization check
  socket.on('join_room', async (roomId) => {
    const assignmentId = roomId.replace('room_', '');
    const hasAccess = await checkAssignmentPermission(socket.token, assignmentId);
    if (!hasAccess) {
      console.warn(`[SOCKET AUTH] User ${socket.userId} denied access to join room: ${roomId}`);
      socket.emit('error', 'Unauthorized to join room');
      return;
    }

    socket.join(roomId);
    console.log(`[SOCKET ROOM JOIN] Client ${socket.id} joined room: ${roomId}`);
  });

  // Leave room handler
  socket.on('leave_room', (roomId) => {
    socket.leave(roomId);
    console.log(`[SOCKET ROOM LEAVE] Client ${socket.id} left room: ${roomId}`);
  });

  // Relay code updates from student to teacher (preventing spoofing)
  socket.on('code_update', ({ roomId, code, language, studentId }) => {
    if (studentId !== socket.userId) {
      console.warn(`[SOCKET AUTH] Blocked spoofed code_update: ${socket.userId} tried to act as ${studentId}`);
      return;
    }
    console.log(`[SERVER_EVENT_RECEIVED] code_update from student: ${studentId}`);
    socket.to(roomId).emit('code_update', { roomId, code, language, studentId });
  });

  // Relay code request from teacher to student
  socket.on('request_code', ({ roomId, studentId }) => {
    console.log(`[SERVER_EVENT_RECEIVED] request_code targeting student: ${studentId}`);
    socket.to(roomId).emit('request_code', { roomId, studentId });
  });

  // Handle student activity event emissions (preventing spoofing)
  socket.on('student_activity', (data) => {
    const { eventType, studentId, assignmentId } = data;
    if (studentId !== socket.userId) {
      console.warn(`[SOCKET AUTH] Blocked spoofed student_activity: ${socket.userId} tried to act as ${studentId}`);
      return;
    }
    console.log(`[SERVER_EVENT_RECEIVED] ${eventType} from student: ${studentId}`);
    
    const roomId = `room_${assignmentId}`;
    socket.to(roomId).emit('student_activity', data);
  });

  // Custom ping handler
  socket.on('ping', (data) => {
    const sender = data?.studentId ? `student: ${data.studentId}` : (data?.teacherId ? 'teacher' : 'unknown');
    console.log(`[SERVER_EVENT_RECEIVED] ping from ${sender}`);
    socket.emit('pong');
  });

  socket.on('run', async ({ sessionId, language, code, userId }) => {
    console.log(`[SERVER_EVENT_RECEIVED] run from student: ${userId || 'anonymous'}`);
    if (!sessionId) return;
    
    // Prevent studentId spoofing
    if (userId && userId !== socket.userId) {
      socket.emit('output', `\r\n\x1b[31m[Security Error: Student ID mismatch]\x1b[0m\r\n`);
      return;
    }

    // Strict UUID format validation to prevent path traversals
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(sessionId)) {
      socket.emit('output', `\r\n\x1b[31m[Security Error: Invalid or unsafe sessionId format]\x1b[0m\r\n`);
      return;
    }

    socket.join(sessionId);
    logSession(sessionId, `RUN: ${language} (User ID: ${socket.userId})`);

    cleanupSession(sessionId);

    // Rate Limiting per User ID, falling back to IP Address for anonymous users
    const userIp = socket.handshake.address || socket.conn.remoteAddress || 'anonymous';
    const rateLimitIdentifier = userId || userIp;

    if (isRateLimited(rateLimitIdentifier)) {
      io.to(sessionId).emit('output', `\r\n\x1b[31m[Too many executions. Try again later. (Limit: ${RATE_LIMIT_PER_MINUTE} runs/minute)]\x1b[0m\r\n`);
      return;
    }

    if (!ALLOWED_LANGUAGES.includes(language)) {
      io.to(sessionId).emit('output', `\r\n\x1b[31m[Security Error: Unsupported language: ${language}]\x1b[0m\r\n`);
      return;
    }

    // Capping active execution limit
    if (activeExecutionsCount >= MAX_CONCURRENT_RUNS) {
      io.to(sessionId).emit('output', `\r\n\x1b[31m[Server Busy: Concurrent execution limit of ${MAX_CONCURRENT_RUNS} reached. Please try again in a moment.]\x1b[0m\r\n`);
      return;
    }

    // Create isolated session directory
    const sessionDir = path.join(TEMP_DIR, sessionId);
    if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

    const fileName = getFileName(language, code);
    const filePath = path.join(sessionDir, fileName);
    fs.writeFileSync(filePath, code);

    // Initialize session placeholder and increment counter
    const session = {
      process: null,
      sessionDir,
      outputBytes: 0,
      status: 'compiling',
      wallTimeout: null,
      idleTimeout: null,
      waitingInputTimer: null,
      monitorInterval: null,
      disconnectTimer: null,
      active: true,
    };
    sessions.set(sessionId, session);
    activeExecutionsCount++;

    const startTime = Date.now();
    recordExecutionStart(false, language);

    let execConfig;
    try {
      execConfig = getExecutionConfig(language, filePath, sessionDir);
    } catch (err) {
      io.to(sessionId).emit('output', `\r\n\x1b[31m[Error: ${err.message}]\x1b[0m\r\n`);
      metrics.totalErrors++;
      return;
    }

    // ── Compile step (if needed) ──────────────────────────────────────────────
    if (execConfig.compileCmd) {
      io.to(sessionId).emit('output', `\x1b[33m$ Compiling...\x1b[0m\r\n`);
      try {
        await new Promise((resolve, reject) => {
          const compiler = spawn(execConfig.compileCmd, execConfig.compileArgs, {
            stdio: ['ignore', 'pipe', 'pipe'],
          });
          let compileErr = '';
          compiler.stderr.on('data', (d) => { compileErr += d.toString(); });
          compiler.stdout.on('data', (d) => { compileErr += d.toString(); });
          compiler.on('close', (code) => {
            if (code !== 0) {
              reject(new Error(compileErr || 'Compilation failed'));
            } else {
              resolve();
            }
          });
          compiler.on('error', reject);
        });

        if (language === 'java') {
          const className = path.basename(filePath, '.java');
          const classFilePath = path.join(sessionDir, `${className}.class`);
          if (!fs.existsSync(classFilePath)) {
            throw new Error(`Expected Java class file not found: ${className}.class`);
          }
        }

        io.to(sessionId).emit('output', `\x1b[32m✓ Compiled successfully\x1b[0m\r\n`);
      } catch (compileErr) {
        io.to(sessionId).emit('output', `\r\n\x1b[31m[Compilation Error]\x1b[0m\r\n${compileErr.message}\r\n`);
        metrics.totalCompilationFailures++;
        metrics.totalErrors++;
        emitStatus(sessionId, 'killed');
        cleanupSession(sessionId);
        return;
      }
    }

    // ── Spawn execution process ───────────────────────────────────────────────
    logSession(sessionId, `Spawning: ${execConfig.cmd} ${execConfig.args.join(' ')}`);
    const proc = spawn(execConfig.cmd, execConfig.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: sessionDir,
      detached: process.platform !== 'win32',
    });

    session.process = proc;
    session.status = 'running';
    emitStatus(sessionId, 'running');

    // Configurable Wall Clock Timeout (e.g. 30s)
    session.wallTimeout = setTimeout(() => {
      io.to(sessionId).emit('output', `\r\n\x1b[31m[Execution Timeout: Wall clock limit of ${MAX_WALL_TIMEOUT_MS / 1000}s reached]\x1b[0m\r\n`);
      metrics.totalTimeouts++;
      emitStatus(sessionId, 'killed');
      cleanupSession(sessionId);
    }, MAX_WALL_TIMEOUT_MS);

    const resetIdleTimeout = () => {
      if (session.idleTimeout) clearTimeout(session.idleTimeout);
      session.idleTimeout = setTimeout(() => {
        io.to(sessionId).emit('output', '\r\n\x1b[33m[Process terminated: 60s idle timeout]\x1b[0m\r\n');
        emitStatus(sessionId, 'killed');
        cleanupSession(sessionId);
      }, 60 * 1000);
    };

    const resetWaitingInputTimer = () => {
      emitStatus(sessionId, 'running');
      if (session.waitingInputTimer) clearTimeout(session.waitingInputTimer);
      session.waitingInputTimer = setTimeout(() => {
        emitStatus(sessionId, 'waiting-input');
      }, 500);
    };

    resetIdleTimeout();
    resetWaitingInputTimer();

    // CPU and RAM Resource Monitoring (polls every 1000ms)
    let cpuSecondsAccumulator = 0;
    session.monitorInterval = setInterval(async () => {
      try {
        if (!session.process || session.process.killed) return;
        const stats = await pidusage(session.process.pid);
        
        cpuSecondsAccumulator += stats.cpu / 100;
        const memMB = stats.memory / 1024 / 1024;
        
        if (memMB > MAX_MEMORY_MB) {
          io.to(sessionId).emit('output', `\r\n\x1b[31m[Memory Limit Exceeded (${Math.round(memMB)}MB > ${MAX_MEMORY_MB}MB)]\x1b[0m\r\n`);
          metrics.totalMemoryExceeded++;
          emitStatus(sessionId, 'killed');
          cleanupSession(sessionId);
        } else if (cpuSecondsAccumulator * 1000 > MAX_CPU_TIMEOUT_MS) {
          io.to(sessionId).emit('output', `\r\n\x1b[31m[Execution Timeout: CPU limit of ${MAX_CPU_TIMEOUT_MS / 1000}s reached]\x1b[0m\r\n`);
          metrics.totalTimeouts++;
          emitStatus(sessionId, 'killed');
          cleanupSession(sessionId);
        }
      } catch (e) { /* process finished */ }
    }, 1000);

    const handleOutput = (data) => {
      const chunk = data.toString();
      session.outputBytes += Buffer.byteLength(chunk, 'utf8');
      resetIdleTimeout();
      resetWaitingInputTimer();
      if (session.outputBytes > MAX_OUTPUT_BYTES) {
        io.to(sessionId).emit('output', `\r\n\x1b[31m[Output truncated. Maximum output size exceeded.]\x1b[0m\r\n`);
        metrics.totalErrors++;
        emitStatus(sessionId, 'killed');
        cleanupSession(sessionId);
      } else {
        io.to(sessionId).emit('output', chunk);
      }
    };

    proc.stdout.on('data', (data) => {
      handleOutput(data);
    });
    proc.stderr.on('data', (data) => {
      handleOutput(data);
    });

    proc.on('close', (code) => {
      logSession(sessionId, `Process exited with code ${code}, killed: ${proc.killed}`);
      io.to(sessionId).emit('exit', code);
      if (code === 0) {
        io.to(sessionId).emit('output', `\r\n\x1b[32m[Process exited with code 0]\x1b[0m\r\n`);
      } else if (code !== null) {
        io.to(sessionId).emit('output', `\r\n\x1b[31m[Process exited with code ${code}]\x1b[0m\r\n`);
        metrics.totalErrors++;
      }
      recordExecutionTime(Date.now() - startTime);
      emitStatus(sessionId, 'finished');
      cleanupSession(sessionId);
    });

    proc.on('error', (err) => {
      logSession(sessionId, `Process Error: ${err.message}`);
      io.to(sessionId).emit('output', `\r\n\x1b[31m[Process Error: ${err.message}]\x1b[0m\r\n`);
      metrics.totalErrors++;
      emitStatus(sessionId, 'killed');
      cleanupSession(sessionId);
    });
  });

  // ── stdin input ───────────────────────────────────────────────────────────
  socket.on('input', ({ sessionId, data }) => {
    if (!sessionId) return;
    const session = sessions.get(sessionId);
    
    if (session && session.process && session.process.stdin && !session.process.stdin.destroyed) {
      try {
        logSession(sessionId, `Writing to stdin (length: ${data.length})`);
        const normalizedData = data.replace(/\r/g, '\n');
        session.process.stdin.write(normalizedData);
      } catch (e) {
        logSession(sessionId, `stdin write error: ${e.message}`);
      }
      
      if (session.idleTimeout) {
        clearTimeout(session.idleTimeout);
        session.idleTimeout = setTimeout(() => {
          io.to(sessionId).emit('output', '\r\n\x1b[33m[Process terminated: 60s idle timeout]\x1b[0m\r\n');
          emitStatus(sessionId, 'killed');
          cleanupSession(sessionId);
        }, 60 * 1000);
      }
      
      emitStatus(sessionId, 'running');
      if (session.waitingInputTimer) clearTimeout(session.waitingInputTimer);
      session.waitingInputTimer = setTimeout(() => {
        emitStatus(sessionId, 'waiting-input');
      }, 500);
    }
  });

  socket.on('stop', () => {
    const sessionId = socket.sessionId;
    if (!sessionId) return;
    io.to(sessionId).emit('output', '\r\n\x1b[33m[Process stopped by user]\x1b[0m\r\n');
    emitStatus(sessionId, 'killed');
    cleanupSession(sessionId);
  });

  socket.on('disconnect', () => {
    console.log(`[SOCKET DISCONNECT] Client disconnected: ${socket.id}`);
    const sessionId = socket.sessionId;
    if (sessionId) {
      const room = io.sockets.adapter.rooms.get(sessionId);
      const numClients = room ? room.size : 0;
      if (numClients === 0) {
        const session = sessions.get(sessionId);
        if (session) {
          session.disconnectTimer = setTimeout(() => {
            emitStatus(sessionId, 'killed');
            cleanupSession(sessionId);
          }, 15000);
        }
      }
    }
  });
});

app.post('/execute', restLimiter, async (req, res) => {
  const { language, code, input = "", timeLimit = 5, memoryLimit = 256 } = req.body;
  
  if (!language || !code) {
    return res.status(400).json({ error: "Language and code are required" });
  }

  if (!ALLOWED_LANGUAGES.includes(language)) {
    return res.status(400).json({ error: `Unsupported language: ${language}` });
  }

  // Capping active execution limit
  if (activeExecutionsCount >= MAX_CONCURRENT_RUNS) {
    return res.status(503).json({ error: "Server Busy: Concurrent execution limit reached. Try again in a moment." });
  }

  activeExecutionsCount++;
  const sessionId = uuidv4();
  const sessionDir = path.join(TEMP_DIR, sessionId);
  
  try {
    fs.mkdirSync(sessionDir, { recursive: true });

    const fileName = getFileName(language, code);
    const filePath = path.join(sessionDir, fileName);
    fs.writeFileSync(filePath, code);

    const startTime = Date.now();
    recordExecutionStart(true, language);

    const execConfig = getExecutionConfig(language, filePath, sessionDir);

    // Compile step
    if (execConfig.compileCmd) {
      try {
        await new Promise((resolve, reject) => {
          const compiler = spawn(execConfig.compileCmd, execConfig.compileArgs, {
            stdio: ['ignore', 'pipe', 'pipe'],
          });
          let compileErr = '';
          compiler.stderr.on('data', (d) => { compileErr += d.toString(); });
          compiler.stdout.on('data', (d) => { compileErr += d.toString(); });
          compiler.on('close', (code) => {
            if (code !== 0) {
              reject(new Error(compileErr || 'Compilation failed'));
            } else {
              resolve();
            }
          });
          compiler.on('error', reject);
        });

        if (language === 'java') {
          const className = path.basename(filePath, '.java');
          const classFilePath = path.join(sessionDir, `${className}.class`);
          if (!fs.existsSync(classFilePath)) {
            throw new Error(`Expected Java class file not found: ${className}.class`);
          }
        }
      } catch (compileErr) {
        metrics.totalCompilationFailures++;
        metrics.totalErrors++;
        return res.json({
          output: `[Compilation Error]\n${compileErr.message}`,
          hasError: true,
          exitCode: 1,
          compileError: compileErr.message,
          runTimeMs: 0,
          peakMemoryKb: 0
        });
      }
    }

    // Execute step
    const proc = spawn(execConfig.cmd, execConfig.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: sessionDir,
      detached: process.platform !== 'win32',
    });

    let output = '';
    let hasError = false;
    let peakMemoryKb = 0;
    let duration = 0;

    // Timeout triggers
    const maxCpuMs = timeLimit * 1000;
    const maxMemoryBytes = memoryLimit * 1024 * 1024;
    let limitExceeded = null;

    const killProcess = () => {
      if (proc && !proc.killed) {
        try {
          if (process.platform === 'win32') {
            execSync(`taskkill /pid ${proc.pid} /t /f`);
          } else {
            try {
              process.kill(-proc.pid, 'SIGKILL');
            } catch (killErr) {
              proc.kill('SIGKILL');
            }
          }
        } catch (e) {
          try {
            proc.kill('SIGKILL');
          } catch (err) { /* ignore */ }
        }
      }
    };

    // Timeout: absolute wall time
    const wallTimeout = setTimeout(() => {
      limitExceeded = 'Time Limit Exceeded';
      hasError = true;
      killProcess();
    }, timeLimit * 1000 + 2000); // add 2s buffer for startup/IO delay

    // CPU and RAM Polling
    let cpuSecondsAccumulator = 0;
    const monitorInterval = setInterval(async () => {
      try {
        if (!proc || proc.killed) return;
        const stats = await pidusage(proc.pid);
        cpuSecondsAccumulator += stats.cpu / 100;
        const memKb = stats.memory / 1024;
        if (memKb > peakMemoryKb) peakMemoryKb = memKb;

        if (stats.memory > maxMemoryBytes) {
          limitExceeded = 'Memory Limit Exceeded';
          hasError = true;
          killProcess();
        } else if (cpuSecondsAccumulator * 1000 > maxCpuMs) {
          limitExceeded = 'Time Limit Exceeded';
          hasError = true;
          killProcess();
        }
      } catch (e) {
        // ignore
      }
    }, 100); // poll every 100ms for accurate metrics!

    // Pipe stdin input
    if (input) {
      proc.stdin.write(input.endsWith('\n') ? input : input + '\n');
    }
    proc.stdin.end();

    proc.stdout.on('data', (d) => { output += d.toString(); });
    proc.stderr.on('data', (d) => { output += d.toString(); hasError = true; });

    const runResult = await new Promise((resolve) => {
      proc.on('close', (code) => {
        resolve({ code });
      });
      proc.on('error', (err) => {
        resolve({ code: -1, error: err });
      });
    });

    clearInterval(monitorInterval);
    clearTimeout(wallTimeout);
    duration = Date.now() - startTime;
    recordExecutionTime(duration);

    if (limitExceeded) {
      if (limitExceeded === 'Time Limit Exceeded') metrics.totalTimeouts++;
      if (limitExceeded === 'Memory Limit Exceeded') metrics.totalMemoryExceeded++;
      metrics.totalErrors++;
      return res.json({
        output: output + `\n[Execution Error: ${limitExceeded}]`,
        hasError: true,
        exitCode: -1,
        verdict: limitExceeded,
        runTimeMs: duration,
        peakMemoryKb: Math.round(peakMemoryKb)
      });
    }

    if (runResult.error) {
      metrics.totalErrors++;
      return res.json({
        output: output + `\n[Runtime Error: ${runResult.error.message}]`,
        hasError: true,
        exitCode: -1,
        runTimeMs: duration,
        peakMemoryKb: Math.round(peakMemoryKb)
      });
    }

    const isErr = hasError || runResult.code !== 0;
    if (isErr) {
      metrics.totalErrors++;
    }

    return res.json({
      output,
      hasError: isErr,
      exitCode: runResult.code,
      runTimeMs: duration,
      peakMemoryKb: Math.round(peakMemoryKb)
    });

  } catch (err) {
    console.error("Express execute error:", err);
    return res.status(500).json({ error: "Internal execution server error: " + err.message });
  } finally {
    activeExecutionsCount = Math.max(0, activeExecutionsCount - 1);
    // Purge temp directory safely in background
    setTimeout(() => {
      try {
        if (fs.existsSync(sessionDir)) {
          fs.rmSync(sessionDir, { recursive: true, force: true });
        }
      } catch (e) {
        // ignore
      }
    }, 1000);
  }
});

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    activeSessions: sessions.size,
    metrics: {
      totalExecutions: metrics.totalExecutions,
      totalCompilationFailures: metrics.totalCompilationFailures,
      totalTimeouts: metrics.totalTimeouts,
      totalMemoryExceeded: metrics.totalMemoryExceeded,
      totalErrors: metrics.totalErrors,
      totalSessionsCreated: metrics.totalSessionsCreated,
      averageExecutionTimeMs: metrics.averageExecutionTimeMs,
      restExecutions: metrics.restExecutions,
      socketExecutions: metrics.socketExecutions,
      languages: metrics.languages
    }
  });
});

// ─── Error Monitoring ─────────────────────────────────────────────────────────
process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION ON SERVER]', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[UNHANDLED REJECTION ON SERVER]', reason);
});

// ─── Graceful Shutdown Hooks ──────────────────────────────────────────────────
const gracefulShutdown = () => {
  console.log('\r\n[SYSTEM SHUTDOWN] Gracefully terminating execution server...');
  
  // Kill active user processes
  for (const sessionId of sessions.keys()) {
    cleanupSession(sessionId);
  }

  // Clear TEMP directory files immediately
  try {
    if (fs.existsSync(TEMP_DIR)) {
      fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    }
  } catch (e) {
    console.error('Failed to purge temp directory', e);
  }
  
  // Close HTTP server and socket.io bindings
  server.close(() => {
    console.log('[SYSTEM SHUTDOWN] Sockets and HTTP connections terminated.');
    process.exit(0);
  });
  
  setTimeout(() => {
    console.log('[SYSTEM SHUTDOWN] Force exited.');
    process.exit(1);
  }, 3000);
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

const PORT = process.env.PORT || 3001;

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `Port ${PORT} is already in use. Stop the existing execution server and try again.`
    );
    process.exit(1);
  }
  console.error(err);
});

server.listen(PORT, () => {
  console.log(`Execution Server running on port ${PORT}`);
  console.log(`Supported languages: ${ALLOWED_LANGUAGES.join(', ')}`);
});
