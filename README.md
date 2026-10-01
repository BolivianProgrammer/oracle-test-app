# OCI Test App

Node.js + Express app deployed on an Oracle Cloud Infrastructure (OCI) compute instance.

| Instance | |
|---|---|
| Shape | VM.Standard.E3.Flex — 1 OCPU (2 vCPUs), 3 GB RAM, 1 Gbps |
| OS | Ubuntu 22.04 (user `ubuntu`) |
| Region | sa-santiago-1 |

## What the app does

| Route | Description |
|---|---|
| `/` | Dashboard: live server info, CPU test, task list |
| `GET /api/health` | Health check |
| `GET /api/info` | Hostname, CPU, memory, load, uptime |
| `GET /api/compute?n=30` | CPU-heavy Fibonacci (n capped at 32), for load tests |
| `GET/POST /api/tasks`, `PATCH/DELETE /api/tasks/:id` | Simple task CRUD (in memory) |

Architecture on the VM:

```
Browser ──▶ :80 Nginx (reverse proxy) ──▶ 127.0.0.1:3000 Node/Express (managed by pm2)
```

## Run locally

```bash
npm install
npm start
```

Open http://localhost:3000

## Deploy to the OCI instance

### 1. Open port 80 in the OCI Console (one time)

Networking → Virtual cloud networks → `test_vnic` → Subnets → your subnet → Security List → **Add Ingress Rules**:

- Source CIDR: `0.0.0.0/0`
- IP Protocol: TCP
- Destination port range: `80`

### 2. Upload the code to GitHub (from your PC)

Create an empty repo on GitHub, then in this folder:

```bash
git init
git add .
git commit -m "Initial Express app"
git branch -M main
git remote add origin https://github.com/<user>/<repo>.git
git push -u origin main
```

### 3. Connect to the VM and deploy

```bash
ssh -i C:\path\to\your-key.key ubuntu@<PUBLIC_IP>
```

On the VM:

```bash
git clone https://github.com/<user>/<repo>.git app
cd app
bash deploy/deploy.sh
```

The script installs Node.js 22, Nginx and pm2, starts the app, sets it to start on reboot, configures Nginx on port 80, and opens port 80 in the VM's iptables firewall.

Open `http://<PUBLIC_IP>` in your browser.

### Updating after code changes

On your PC: commit and `git push`. On the VM:

```bash
cd ~/app && git pull && bash deploy/deploy.sh
```

### Alternative: upload without GitHub

From PowerShell on your PC, in this folder:

```bash
tar --exclude=node_modules --exclude=.git -czf app.tgz .
scp -i C:\path\to\your-key.key app.tgz ubuntu@<PUBLIC_IP>:~
```

On the VM:

```bash
mkdir -p ~/app && tar -xzf ~/app.tgz -C ~/app && cd ~/app && bash deploy/deploy.sh
```

## Testing the instance

### Benchmark the VM (on the VM)

```bash
cd ~/app && bash deploy/benchmark.sh
```

Runs CPU, memory, disk and a 2-minute stress test (about 5 min total) and saves `benchmark-<date>.txt`.

### Load-test the app (from your PC)

Uses [autocannon](https://github.com/mcollina/autocannon) through npx; nothing else to install.

```bash
npx autocannon -c 50 -d 30 http://<PUBLIC_IP>/api/health
npx autocannon -c 20 -d 30 "http://<PUBLIC_IP>/api/compute?n=25"
```

- The first test measures raw request throughput (network + Nginx + Express).
- The second one is CPU-bound and shows where 1 OCPU starts to saturate.

While it runs, watch the VM with `htop` (in another SSH session) and the **Monitoring** tab of the instance in the OCI Console.

## Useful commands on the VM

```bash
pm2 status                  # is the app running?
pm2 logs oracle-test-app    # app logs
pm2 restart oracle-test-app
sudo systemctl status nginx
sudo tail -f /var/log/nginx/access.log
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| Browser times out | Security List is missing the port 80 ingress rule, or iptables wasn't updated (re-run `deploy.sh`) |
| `502 Bad Gateway` | The app isn't running: `pm2 status`, `pm2 logs oracle-test-app` |
| `Permission denied (publickey)` | Wrong key file or user; the user is `ubuntu` |
| `bash\r: No such file or directory` | Script got Windows line endings; run `sed -i 's/\r$//' deploy/*.sh` |
