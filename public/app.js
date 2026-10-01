const $ = (sel) => document.querySelector(sel);

function formatUptime(sec) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return [d && `${d}d`, (d || h) && `${h}h`, `${m}m`, `${s}s`].filter(Boolean).join(' ');
}

// ---------- Server info ----------

async function loadInfo() {
  const status = $('#status');
  try {
    const res = await fetch('/api/info');
    const info = await res.json();
    const fields = [
      ['Hostname', info.hostname],
      ['OS', info.platform],
      ['CPU', `${info.cpuCount} × ${info.cpuModel}`],
      ['Load avg (1/5/15m)', info.loadAvg.join(' / ')],
      ['Memory free', `${info.freeMemMB} / ${info.totalMemMB} MB`],
      ['App memory', `${info.appMemMB} MB`],
      ['System uptime', formatUptime(info.systemUptimeSec)],
      ['App uptime', formatUptime(info.appUptimeSec)],
      ['Node.js', info.nodeVersion],
    ];
    $('#info').innerHTML = '';
    for (const [label, value] of fields) {
      const div = document.createElement('div');
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dt.textContent = label;
      dd.textContent = value;
      div.append(dt, dd);
      $('#info').append(div);
    }
    status.textContent = 'online';
    status.className = 'badge ok';
  } catch {
    status.textContent = 'offline';
    status.className = 'badge bad';
  }
}

// ---------- CPU test ----------

$('#compute-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const n = $('#n').value;
  $('#compute-result').textContent = 'Running…';
  const t0 = performance.now();
  const res = await fetch(`/api/compute?n=${encodeURIComponent(n)}`);
  const data = await res.json();
  const roundTrip = (performance.now() - t0).toFixed(1);
  $('#compute-result').textContent =
    `fib(${data.n}) = ${data.result} · server: ${data.ms} ms · round trip: ${roundTrip} ms`;
});

// ---------- Tasks ----------

async function loadTasks() {
  const res = await fetch('/api/tasks');
  const tasks = await res.json();
  const list = $('#tasks');
  list.innerHTML = '';
  for (const task of tasks) {
    const li = document.createElement('li');
    if (task.done) li.classList.add('done');

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = task.done;
    checkbox.addEventListener('change', async () => {
      await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ done: checkbox.checked }),
      });
      loadTasks();
    });

    const title = document.createElement('span');
    title.textContent = task.title;

    const del = document.createElement('button');
    del.textContent = '✕';
    del.title = 'Delete';
    del.addEventListener('click', async () => {
      await fetch(`/api/tasks/${task.id}`, { method: 'DELETE' });
      loadTasks();
    });

    li.append(checkbox, title, del);
    list.append(li);
  }
}

$('#task-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = $('#task-title');
  await fetch('/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: input.value }),
  });
  input.value = '';
  loadTasks();
});

loadInfo();
loadTasks();
setInterval(loadInfo, 3000);
