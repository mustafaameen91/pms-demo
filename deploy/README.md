# Deploying tamm to pms.codility.tech

Server: `82.39.115.116` (Linux + Nginx, shared with other sites). The domain already points there.

How it runs:

```
internet → Nginx :443 (pms.codility.tech) → Next.js on 127.0.0.1:3002 (PM2) → PostgreSQL on 127.0.0.1:5433 (Docker)
```

- **PostgreSQL in Docker**: the app is built on PostgreSQL. It runs in its own container, `tamm-db`,
  and listens only on the server itself. MySQL and the other apps are not touched.
- **App with Node + PM2**: Next.js listens only on 127.0.0.1, and Nginx is the public entrance.
- **Folders on the server**:

  ```
  /var/www/pms.codility.tech/
    app/       code (replaced on every upload)
    uploads/   files people upload (never touched by an upload; back it up)
    backups/   nightly database + uploads backups
    db.env     the database password (for Docker)
  ```

Replace `user` below with your SSH user. Steps run in order: 1.1, 1.2, 1.3 … Commands marked **[Mac]** run on your computer; everything else
runs on the server.

---

## 1. One-time server setup

### 1.1 Check what's there and free ports

```bash
node -v            # needs 20.9 or newer (22 LTS recommended)
docker -v; docker compose version
sudo ss -ltnp | grep -E ':3002|:5433'   # must print nothing; if not, see "Changing ports"
```

Install anything missing:

```bash
# Node 22 (skip if node -v is already ≥ 20.9)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs
# pnpm (the version the project pins) and PM2
sudo corepack enable && corepack prepare pnpm@10.33.2 --activate
sudo npm install -g pm2
# Docker (skip if installed)
curl -fsSL https://get.docker.com | sudo sh && sudo usermod -aG docker $USER   # log out and back in after
```

### 1.2 Folders

```bash
sudo mkdir -p /var/www/pms.codility.tech/{app,uploads,backups}
sudo chown -R $USER:$USER /var/www/pms.codility.tech
```

### 1.3 Get the code from GitHub

The code is at https://github.com/mustafaameen91/pms-demo.

```bash
cd /var/www/pms.codility.tech
git clone https://github.com/mustafaameen91/pms-demo.git app
```

If the repository is made private later, the server needs a read-only deploy key:

1. Run `ssh-keygen -t ed25519 -f ~/.ssh/tamm_deploy -N ""` and copy the output of
   `cat ~/.ssh/tamm_deploy.pub`.
2. On GitHub, open the repository → Settings → Deploy keys and add it, with write access off.
3. Point the clone at SSH:
   `git -C app remote set-url origin git@github.com:mustafaameen91/pms-demo.git`.
4. Tell SSH to use the key for GitHub by adding this to `~/.ssh/config`:
   `Host github.com` / `IdentityFile ~/.ssh/tamm_deploy`.

### 1.4 Start the database

```bash
cd /var/www/pms.codility.tech
echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)" > db.env && chmod 600 db.env
cat db.env    # you'll paste this password into the app's .env next
docker compose -f app/deploy/docker-compose.db.yml --env-file db.env up -d
docker ps --filter name=tamm-db    # STATUS should say "healthy" after a few seconds
```

### 1.5 The app's settings

```bash
cd /var/www/pms.codility.tech/app
cp deploy/env.production.example .env && chmod 600 .env
openssl rand -base64 32     # → BETTER_AUTH_SECRET
openssl rand -hex 32        # → CRON_SECRET
nano .env
```

Fill in:

- `DATABASE_URL`: replace `CHANGE_ME` with the password from `db.env`.
- `BETTER_AUTH_SECRET` and `CRON_SECRET`.
- `SUPER_ADMIN_EMAILS`: your email.
- `SMTP_*`: optional. Without them, invites and password resets are printed to `pm2 logs tamm`
  instead of being emailed.

### 1.6 Install, create the tables, build, start

```bash
bash deploy/server-update.sh       # ends with "App answers on 127.0.0.1:3002 with HTTP 200"
pm2 startup                        # prints a sudo command: run it, so the app comes back after a reboot
pm2 save
```

On an empty database this creates all tables. Open the site, **sign up with the email you put in
`SUPER_ADMIN_EMAILS`**, and you are the platform admin (`/admin`).

> **Want your current local data instead of an empty start?** Do this instead of signing up.
>
> **[Mac]**:
>
> ```bash
> docker exec pms-db pg_dump -U pms -d pms2 --format=custom --no-owner > ~/tamm.dump
> scp ~/tamm.dump user@82.39.115.116:/var/www/pms.codility.tech/backups/
> rsync -az ~/Projects/pms2/uploads/ user@82.39.115.116:/var/www/pms.codility.tech/uploads/
> ```
>
> **Server**: this replaces whatever is in the server database.
>
> ```bash
> pm2 stop tamm
> docker exec -i tamm-db pg_restore -U tamm -d tamm --clean --if-exists --no-owner < /var/www/pms.codility.tech/backups/tamm.dump
> pm2 start tamm
> ```
>
> Accounts keep their passwords. The local database is a copy of the original PMS, so check that it holds
> only what you want public before uploading it.

### 1.7 Nginx + HTTPS

```bash
sudo cp /var/www/pms.codility.tech/app/deploy/nginx/pms.codility.tech.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/pms.codility.tech.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx     # nginx -t must say "ok" — it checks all your sites
sudo apt-get install -y certbot python3-certbot-nginx   # if certbot isn't installed yet
sudo certbot --nginx -d pms.codility.tech        # choose "redirect" if it asks
```

Open **https://pms.codility.tech**.

If your server uses `/etc/nginx/conf.d/` instead of `sites-available`, copy the file there instead and
skip the `ln` line.

### 1.8 Timers (weekly reports + backups)

```bash
crontab -e
```

Add these two lines, with the `CRON_SECRET` from `.env`:

```
0 7 * * 6  curl -fsS -H "Authorization: Bearer YOUR_CRON_SECRET" https://pms.codility.tech/api/cron/weekly-reports > /dev/null
30 2 * * * bash /var/www/pms.codility.tech/app/deploy/backup.sh >> /var/www/pms.codility.tech/backups/backup.log 2>&1
```

---

## 2. Every update after that

**[Mac]** commit and push:

```bash
cd ~/Projects/pms2
git add -A && git commit -m "What changed" && git push
```

**Server** pull, then install, apply new migrations, build and `pm2 reload`. Your `.env`, uploads and
database stay as they are.

```bash
cd /var/www/pms.codility.tech/app
git pull
bash deploy/server-update.sh
```

`deploy/upload.sh user@82.39.115.116` is the alternative without GitHub: it copies the files straight
from the Mac.

## 3. Phone app

Build it against the live server:

```bash
cd ~/Projects/pms2/mobile
flutter build apk --release --dart-define=API_URL=https://pms.codility.tech
flutter build ipa --release --dart-define=API_URL=https://pms.codility.tech   # iOS
```

## 4. Day-to-day

| Task | Command |
|---|---|
| App logs | `pm2 logs tamm` |
| Restart the app | `pm2 restart tamm` |
| Status | `pm2 status` · `docker ps --filter name=tamm-db` |
| Database shell | `docker exec -it tamm-db psql -U tamm -d tamm` |
| Restore a backup | `pm2 stop tamm && docker exec -i tamm-db pg_restore -U tamm -d tamm --clean --if-exists < backups/db_….dump && pm2 start tamm` |

## Changing ports

If 3002 is taken, change it in **both** `deploy/ecosystem.config.cjs` (`-p 3002`) and
`deploy/nginx/pms.codility.tech.conf` (both `proxy_pass` lines), and in the health check at the end of
`deploy/server-update.sh`. If 5433 is taken, change the left-hand side of `127.0.0.1:5433:5432` in
`deploy/docker-compose.db.yml` and the port in `DATABASE_URL`.
