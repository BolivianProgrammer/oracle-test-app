const express = require('express');
const os = require('os');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
// 0.0.0.0 so the app is reachable from outside the VM, not just from localhost
const HOST = process.env.HOST || '0.0.0.0';
const startedAt = Date.now();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- Server info ----------

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.get('/api/info', (req, res) => {
  const cpus = os.cpus();
  res.json({
    hostname: os.hostname(),
    platform: `${os.type()} ${os.release()}`,
    arch: os.arch(),
    cpuModel: cpus[0] ? cpus[0].model : 'unknown',
    cpuCount: cpus.length,
    loadAvg: os.loadavg().map((n) => Number(n.toFixed(2))),
    totalMemMB: Math.round(os.totalmem() / 1024 / 1024),
    freeMemMB: Math.round(os.freemem() / 1024 / 1024),
    appMemMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
    systemUptimeSec: Math.round(os.uptime()),
    appUptimeSec: Math.round((Date.now() - startedAt) / 1000),
    nodeVersion: process.version,
  });
});

// CPU-heavy endpoint for load testing. n is capped so nobody can freeze the VM.
function fib(n) {
  return n < 2 ? n : fib(n - 1) + fib(n - 2);
}

app.get('/api/compute', (req, res) => {
  const n = Math.min(Math.max(parseInt(req.query.n, 10) || 25, 1), 32);
  const start = process.hrtime.bigint();
  const result = fib(n);
  const ms = Number(process.hrtime.bigint() - start) / 1e6;
  res.json({ n, result, ms: Number(ms.toFixed(2)) });
});

// ---------- Tasks (in-memory, resets when the app restarts) ----------

let tasks = [
  { id: 1, title: 'Create the OCI instance', done: true },
  { id: 2, title: 'Deploy the Express app', done: false },
  { id: 3, title: 'Run the load tests', done: false },
];
let nextId = 4;

app.get('/api/tasks', (req, res) => {
  res.json(tasks);
});

app.post('/api/tasks', (req, res) => {
  const title = String((req.body && req.body.title) || '').trim();
  if (!title) return res.status(400).json({ error: 'title is required' });
  if (title.length > 200) return res.status(400).json({ error: 'title is too long' });
  if (tasks.length >= 500) return res.status(400).json({ error: 'too many tasks' });

  const task = { id: nextId++, title, done: false };
  tasks.push(task);
  res.status(201).json(task);
});

app.patch('/api/tasks/:id', (req, res) => {
  const task = tasks.find((t) => t.id === Number(req.params.id));
  if (!task) return res.status(404).json({ error: 'task not found' });
  if (typeof req.body.done === 'boolean') task.done = req.body.done;
  res.json(task);
});

app.delete('/api/tasks/:id', (req, res) => {
  const before = tasks.length;
  tasks = tasks.filter((t) => t.id !== Number(req.params.id));
  if (tasks.length === before) return res.status(404).json({ error: 'task not found' });
  res.status(204).end();
});

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'not found' });
});

app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
});
