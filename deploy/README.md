# PathNotion — deploy runbook

Same shape on both environments. Pi is test, EC2 is production.

| | Pi (test) | EC2 (prod) |
|---|---|---|
| App dir | `/opt/path/pathnotion` | `/home/ec2-user/pathnotion` |
| Service user | `pathdev` | `ec2-user` |
| Process manager | systemd | PM2 (matches MCP server) |
| Port (loopback only) | `4100` | `4100` |
| Nginx server_name | `pathnotion.lan`, Pi IP | `backlog.path2ai.tech` |
| TLS | none (LAN) | Let's Encrypt via certbot |
| SQLite path | `/var/lib/pathnotion/pathnotion.db` | same |

## First-time install

### 1. Install Node (skip if already there)

```bash
# As the service user — uses nvm to match the existing services on the box.
sudo -u pathdev -i bash -c 'curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash'
sudo -u pathdev -i nvm install 20.20.2
```

### 2. Create the app directory and clone

```bash
sudo mkdir -p /opt/path/pathnotion
sudo chown pathdev:pathdev /opt/path/pathnotion
sudo -u pathdev git clone https://github.com/keyman12/Pathnotion.git /opt/path/pathnotion
```

### 3. Create the data directory

```bash
sudo mkdir -p /var/lib/pathnotion
sudo chown pathdev:pathdev /var/lib/pathnotion
```

### 4. Write the `.env` file

```bash
sudo -u pathdev cp /opt/path/pathnotion/api/.env.example /opt/path/pathnotion/.env
sudo -u pathdev vim /opt/path/pathnotion/.env
```

Required values:

```
NODE_ENV=production
PORT=4100
HOST=127.0.0.1
WEB_ORIGIN=http://pathnotion.lan                   # Pi — or https://backlog.path2ai.tech on EC2
SESSION_SECRET=<64 random hex chars>
DATABASE_FILE=/var/lib/pathnotion/pathnotion.db
ANTHROPIC_API_KEY=sk-ant-api03-...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://backlog.path2ai.tech/api/calendar/google/callback
ADMIN_USERNAME=dave
ADMIN_PASSWORD=<first-run only>
```

Generate a random session secret: `openssl rand -hex 32`.

### 5. Install + build

```bash
cd /opt/path/pathnotion
sudo -u pathdev bash -lc 'npm ci'
sudo -u pathdev bash -lc 'npm --workspace api run build'
sudo -u pathdev bash -lc 'npm --workspace web run build'
```

### 6. Initialise the database (first run only)

```bash
cd /opt/path/pathnotion
sudo -u pathdev bash -lc 'npm --workspace api run db:init'
```

### 7. Install the systemd unit (Pi)

```bash
sudo cp /opt/path/pathnotion/deploy/systemd/path-pathnotion.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable path-pathnotion
sudo systemctl start path-pathnotion
sudo systemctl status path-pathnotion --no-pager
```

Or (EC2, matches MCP server pattern):

```bash
cd /home/ec2-user/pathnotion
pm2 start api/dist/index.js --name path-pathnotion --update-env
pm2 save
pm2 startup        # copy the printed command and run it with sudo
```

### 8. Install the nginx site

Pi:

```bash
sudo cp /opt/path/pathnotion/deploy/nginx/pi.conf /etc/nginx/sites-available/path-pathnotion
sudo ln -sf /etc/nginx/sites-available/path-pathnotion /etc/nginx/sites-enabled/path-pathnotion
sudo nginx -t && sudo systemctl reload nginx
```

EC2:

```bash
sudo cp /home/ec2-user/pathnotion/deploy/nginx/backlog.path2ai.tech.conf /etc/nginx/conf.d/path-pathnotion.conf
# Remove the old backlog block that also claimed backlog.path2ai.tech — they can't coexist.
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d backlog.path2ai.tech
```

### 9. Smoke test

```bash
curl -sS http://127.0.0.1:4100/api/health       # {"ok":true}
curl -sS http://pathnotion.lan/api/health        # Pi
curl -sS https://backlog.path2ai.tech/api/health # EC2
```

## Subsequent deploys

Pull + build + restart, one command:

```bash
cd /opt/path/pathnotion           # or /home/ec2-user/pathnotion on EC2
./deploy/deploy.sh
```

The script figures out whether systemd or PM2 is managing the service and restarts the right one.

## Retiring the old backlog service

### Pi

```bash
sudo systemctl stop path-backlog
sudo systemctl disable path-backlog
sudo rm /etc/nginx/sites-enabled/path-backlog  # if present
sudo nginx -t && sudo systemctl reload nginx
# Archive the SQLite if you want to grab anything later:
sudo tar czf /opt/path/backups/backlog-retired-$(date +%F).tar.gz /opt/path/backlog/server/data
```

### EC2

```bash
sudo systemctl stop path-backlog 2>/dev/null || true
sudo systemctl disable path-backlog 2>/dev/null || true
sudo rm /etc/nginx/conf.d/*backlog*.conf 2>/dev/null
sudo nginx -t && sudo systemctl reload nginx
```

Once the old site is gone the nginx block for PathNotion (using `backlog.path2ai.tech`) can take over without a conflict.

## Backups

The Pi already has `/opt/path/backups/`. Add a daily cron for the PathNotion SQLite:

```bash
# /etc/cron.d/path-pathnotion-backup
0 3 * * * pathdev /usr/bin/sqlite3 /var/lib/pathnotion/pathnotion.db ".backup '/opt/path/backups/pathnotion-$(date +\%F).db'" && find /opt/path/backups -name 'pathnotion-*.db' -mtime +30 -delete
```

On EC2, pipe the nightly dump into S3.
