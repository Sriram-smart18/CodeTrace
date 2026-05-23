const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const pidusage = require('pidusage');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

const TEMP_DIR = path.join(__dirname, 'temp');
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR);

const sessions = new Map();

const ALLOWED_LANGUAGES = ['javascript', 'python', 'java', 'c', 'cpp', 'go', 'html'];

const MAX_OUTPUT_BYTES = 1024 * 1024; // 1MB
const MAX_MEMORY_MB = 512;
const MAX_CPU_PERCENT = 95;

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

/**
 * Returns { cmd, args, compileFn? }
 * compileFn(filePath, sessionDir) → { success, error } — optional compile step
 */
const getExecutionConfig = (language, filePath, sessionDir) => {
  switch (language) {
    case 'python':
      return { cmd: 'python', args: ['-u', filePath] };

    case 'javascript':
      return { cmd: 'node', args: [filePath] };

    case 'java': {
      // Java: file must be named Main.java
      const javaFile = path.join(sessionDir, 'Main.java');
      fs.copyFileSync(filePath, javaFile);
      return {
        compileCmd: 'javac',
        compileArgs: [javaFile],
        cmd: 'java',
        args: ['-cp', sessionDir, 'Main'],
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

  if (session.process) {
    try { session.process.kill('SIGKILL'); } catch (e) {}
  }

  ['absoluteTimeout', 'idleTimeout', 'waitingInputTimer', 'monitorInterval', 'disconnectTimer'].forEach((key) => {
    if (session[key]) {
      key === 'monitorInterval' ? clearInterval(session[key]) : clearTimeout(session[key]);
    }
  });

  if (session.sessionDir) {
    try {
      if (fs.existsSync(session.sessionDir)) {
        fs.rmSync(session.sessionDir, { recursive: true, force: true });
      }
    } catch (e) {
      console.error('Error deleting session dir:', e);
    }
  }

  sessions.delete(sessionId);
};

const emitStatus = (sessionId, status) => {
  const session = sessions.get(sessionId);
  if (session && session.status !== status) {
    session.status = status;
    io.to(sessionId).emit('status', status);
  }
};

// ─── Socket.IO handlers ───────────────────────────────────────────────────────

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

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

  socket.on('run', async ({ sessionId, language, code }) => {
    if (!sessionId) return;
    socket.join(sessionId);
    console.log(`RUN: ${language} for session ${sessionId}`);

    cleanupSession(sessionId);

    if (!ALLOWED_LANGUAGES.includes(language)) {
      io.to(sessionId).emit('output', `\r\n\x1b[31m[Error: Unsupported language: ${language}]\x1b[0m\r\n`);
      return;
    }

    // Create isolated session directory
    const sessionDir = path.join(TEMP_DIR, sessionId);
    if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

    const fileName = `prog_${uuidv4()}${getExtension(language)}`;
    const filePath = path.join(sessionDir, fileName);
    fs.writeFileSync(filePath, code);

    let execConfig;
    try {
      execConfig = getExecutionConfig(language, filePath, sessionDir);
    } catch (err) {
      io.to(sessionId).emit('output', `\r\n\x1b[31m[Error: ${err.message}]\x1b[0m\r\n`);
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
        io.to(sessionId).emit('output', `\x1b[32m✓ Compiled successfully\x1b[0m\r\n`);
      } catch (compileErr) {
        io.to(sessionId).emit('output', `\r\n\x1b[31m[Compilation Error]\x1b[0m\r\n${compileErr.message}\r\n`);
        emitStatus(sessionId, 'killed');
        cleanupSession(sessionId);
        return;
      }
    }

    // ── Spawn execution process ───────────────────────────────────────────────
    console.log(`Spawning: ${execConfig.cmd} ${execConfig.args.join(' ')}`);
    const process = spawn(execConfig.cmd, execConfig.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: sessionDir,
    });

    const session = {
      process,
      sessionDir,
      outputBytes: 0,
      status: 'running',
      absoluteTimeout: null,
      idleTimeout: null,
      waitingInputTimer: null,
      monitorInterval: null,
      disconnectTimer: null,
    };
    sessions.set(sessionId, session);
    emitStatus(sessionId, 'running');

    // 5-minute absolute timeout
    session.absoluteTimeout = setTimeout(() => {
      io.to(sessionId).emit('output', '\r\n\x1b[31m[Process terminated: 5-minute timeout reached]\x1b[0m\r\n');
      emitStatus(sessionId, 'killed');
      cleanupSession(sessionId);
    }, 5 * 60 * 1000);

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

    // Resource monitoring
    session.monitorInterval = setInterval(async () => {
      try {
        if (!session.process || session.process.killed) return;
        const stats = await pidusage(session.process.pid);
        const memMB = stats.memory / 1024 / 1024;
        const cpuPct = stats.cpu;
        if (memMB > MAX_MEMORY_MB) {
          io.to(sessionId).emit('output', `\r\n\x1b[31m[Killed: Memory limit exceeded (${Math.round(memMB)}MB > ${MAX_MEMORY_MB}MB)]\x1b[0m\r\n`);
          emitStatus(sessionId, 'killed');
          cleanupSession(sessionId);
        } else if (cpuPct > MAX_CPU_PERCENT) {
          io.to(sessionId).emit('output', `\r\n\x1b[31m[Killed: CPU limit exceeded (${Math.round(cpuPct)}%)]\x1b[0m\r\n`);
          emitStatus(sessionId, 'killed');
          cleanupSession(sessionId);
        }
      } catch (e) { /* process gone */ }
    }, 2000);

    const handleOutput = (data) => {
      const chunk = data.toString();
      session.outputBytes += Buffer.byteLength(chunk, 'utf8');
      resetIdleTimeout();
      resetWaitingInputTimer();
      if (session.outputBytes > MAX_OUTPUT_BYTES) {
        io.to(sessionId).emit('output', '\r\n\x1b[31m[Killed: Output size limit exceeded (1MB)]\x1b[0m\r\n');
        emitStatus(sessionId, 'killed');
        cleanupSession(sessionId);
      } else {
        io.to(sessionId).emit('output', chunk);
      }
    };

    process.stdout.on('data', handleOutput);
    process.stderr.on('data', handleOutput);

    process.on('close', (code) => {
      io.to(sessionId).emit('exit', code);
      if (code === 0) {
        io.to(sessionId).emit('output', `\r\n\x1b[32m[Process exited with code 0]\x1b[0m\r\n`);
      } else if (code !== null) {
        io.to(sessionId).emit('output', `\r\n\x1b[31m[Process exited with code ${code}]\x1b[0m\r\n`);
      }
      emitStatus(sessionId, 'finished');
      cleanupSession(sessionId);
    });

    process.on('error', (err) => {
      io.to(sessionId).emit('output', `\r\n\x1b[31m[Process Error: ${err.message}]\x1b[0m\r\n`);
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
        session.process.stdin.write(data);
      } catch (e) {
        console.error('stdin write error:', e);
      }
      // Reset timers on input
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
    console.log(`Client disconnected: ${socket.id}`);
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

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', sessions: sessions.size });
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`Execution Server running on port ${PORT}`);
  console.log(`Supported languages: ${ALLOWED_LANGUAGES.join(', ')}`);
});
