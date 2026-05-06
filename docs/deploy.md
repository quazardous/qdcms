# Production deployment (nginx / apache)

> Status : guide. Reflects the current 2-worlds layout
> (`core/` + instance). Last reviewed 2026-05-06.

A qdcms instance in production has two moving parts :

1. **SPA bundle** — static `dist/` produced by Vite. Served by
   nginx / apache as plain static files. No Node runtime needed
   on the request path.
2. **Node backend** — `qdcms-backend-server` running under a
   process supervisor (systemd, pm2, docker). Reverse-proxied
   behind the same vhost so `/api/qdcms/*` reaches it.

Plus : the instance's `public/` static assets (favicon, og images,
robots.txt, sitemap.xml), served as-is by the reverse proxy.

```
                            ┌────────────────────────┐
   visitor ──── HTTPS ────▶  │ nginx / apache (vhost) │
                            └──────┬──────────┬──────┘
                                   │          │
                  ┌────────────────┘          └──────────────────┐
                  │                                              │
       /                                                /api/qdcms/*
       /favicon.ico                                              │
       /og.png                                                   ▼
       (static files :                              ┌────────────────────────┐
        SPA dist + public/)                         │ qdcms-backend-server   │
                                                    │ (Node, systemd unit)   │
                                                    │ listens on 127.0.0.1   │
                                                    └────────┬───────────────┘
                                                             │
                                                    ┌────────▼─────────┐
                                                    │ SQLite / MariaDB │
                                                    │ /var/lib/qdcms/  │
                                                    └──────────────────┘
```

## 1. Filesystem layout on the server

A clean way to lay things out on a Debian/Ubuntu host (matching
the qdcms 2-worlds split) :

```
/opt/qdcms/                       ← QDCMS_CORE (the framework)
├── core/                         ← cloned from git (or unpacked)
│   ├── package.json
│   ├── packages/
│   └── node_modules/             ← npm install ran once

/srv/sites/<my-site>/             ← THE INSTANCE
├── package.json                  ← workspaces: ["frontend", "backend"]
├── config/                       ← *.yaml
├── content/                      ← seed
├── public/                       ← favicon, og, robots, sitemap
├── frontend/
│   └── dist/                     ← Vite build output (npm run build)
├── backend/
│   ├── server.ts                 ← thin entry, runs via tsx
│   └── .env                      ← prod env (QDCMS_DB, etc.)
└── node_modules/                 ← npm install ran once

/var/lib/qdcms/<my-site>/         ← STATE (writable)
├── data/                         ← SQLite + journals (or MariaDB elsewhere)
└── log/                          ← optional: app logs
```

Why split between `/opt/qdcms` (read-only after deploy) and
`/srv/sites/<my-site>` (instance, also read-only) and
`/var/lib/qdcms/<my-site>` (writable state) : standard FHS, easy
to back up, easy to lock down with file permissions.

The instance's `package.json` has file: deps to
`/opt/qdcms/core/packages/*`. Update qdcms by `git pull` in
`/opt/qdcms/core/`, then `npm install` once in the core, then
once in the site.

## 2. Build pipeline (one-time + per-deploy)

```sh
# One-time : install deps in both worlds
cd /opt/qdcms/core && npm install
cd /srv/sites/<my-site> && npm install

# Per deploy (after pulling code or editing config) :
cd /srv/sites/<my-site>
npx qdcms config:compile config           # validate + emit .compiled/
npx qdcms config:doctor config            # CI gate: fail on warnings
cd frontend && npm run build              # produces dist/
sudo systemctl restart qdcms@<my-site>    # bounce the Node server
```

The `qdcms` CLI is exposed via the instance's
`node_modules/.bin/` thanks to the file: link to
`@quazardous/qdcms-cli`.

## 3. systemd unit for the Node server

`/etc/systemd/system/qdcms@.service` (template — `%i` is the
site name) :

```ini
[Unit]
Description=qdcms backend server (%i)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=qdcms
Group=qdcms
WorkingDirectory=/srv/sites/%i/backend
EnvironmentFile=/srv/sites/%i/backend/.env
ExecStart=/srv/sites/%i/node_modules/.bin/tsx server.ts
Restart=on-failure
RestartSec=5s

# Hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/var/lib/qdcms/%i

[Install]
WantedBy=multi-user.target
```

Enable + start :

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now qdcms@<my-site>
sudo systemctl status qdcms@<my-site>
```

The `.env` file holds the per-site config :

```ini
PORT=5181
QDCMS_DB=/var/lib/qdcms/<my-site>/data/site.sqlite
QDCMS_DIALECT=sqlite
QDCMS_INSTALL_ON_BOOT=true
QDCMS_CORE=/opt/qdcms/core
NODE_ENV=production
```

> Note on tsx in production : tsx is stable enough for prod use,
> but `node` running compiled JS has a smaller surface and
> startup time. The qdcms-cli's `prepack` step will compile to
> JS in a future release ; until then, tsx in systemd is the
> recommended path.

## 4. nginx vhost

`/etc/nginx/sites-available/my-site.conf` :

```nginx
server {
  listen 80;
  listen [::]:80;
  server_name example.com www.example.com;
  return 301 https://$host$request_uri;
}

server {
  listen 443 ssl http2;
  listen [::]:443 ssl http2;
  server_name example.com www.example.com;

  ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;

  # Reasonable defaults — tune per your security policy.
  ssl_protocols       TLSv1.2 TLSv1.3;
  ssl_ciphers         HIGH:!aNULL:!MD5;
  add_header          Strict-Transport-Security "max-age=63072000" always;

  # Compression for the SPA bundle.
  gzip on;
  gzip_types text/plain text/css application/javascript application/json image/svg+xml;
  gzip_min_length 1024;

  # ─── 1. API → backend node process ──────────────────────────
  location /api/qdcms/ {
    proxy_pass http://127.0.0.1:5181;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # 30s default ; bump if your DC types do heavy server work.
    proxy_read_timeout 30s;
    proxy_connect_timeout 5s;
  }

  # ─── 2. Static public assets (favicon, og, robots, …) ───────
  # Files in <instance>/public/ end up at the URL root via Vite's
  # publicDir override AND are served directly by the reverse
  # proxy here. Either path resolves the same files.
  location = /favicon.ico { root /srv/sites/my-site/public; access_log off; }
  location = /robots.txt  { root /srv/sites/my-site/public; access_log off; }
  location = /sitemap.xml { root /srv/sites/my-site/public; access_log off; }

  # ─── 3. SPA bundle ──────────────────────────────────────────
  # Vite's `dist/` includes index.html + hashed assets. The
  # `try_files` fallback to /index.html supports the SPA's
  # client-side router (every unknown path returns the SPA shell,
  # which then matches the route in JS).
  root /srv/sites/my-site/frontend/dist;
  index index.html;

  # Long-lived cache on hashed assets.
  location ~* \.(js|css|woff2?|ttf|eot|svg|png|jpg|jpeg|gif|webp|ico)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
    try_files $uri =404;
  }

  location / {
    try_files $uri $uri/ /index.html;
  }

  access_log /var/log/nginx/my-site.access.log;
  error_log  /var/log/nginx/my-site.error.log;
}
```

Activate :

```sh
sudo ln -s /etc/nginx/sites-available/my-site.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

## 5. apache vhost

`/etc/apache2/sites-available/my-site.conf` (mods needed :
`ssl`, `headers`, `proxy`, `proxy_http`, `rewrite`) :

```apache
<VirtualHost *:80>
  ServerName example.com
  ServerAlias www.example.com
  Redirect permanent / https://example.com/
</VirtualHost>

<VirtualHost *:443>
  ServerName example.com
  ServerAlias www.example.com

  SSLEngine on
  SSLCertificateFile      /etc/letsencrypt/live/example.com/fullchain.pem
  SSLCertificateKeyFile   /etc/letsencrypt/live/example.com/privkey.pem

  Header always set Strict-Transport-Security "max-age=63072000"

  DocumentRoot /srv/sites/my-site/frontend/dist

  # ─── API → node backend ────────────────────────────────────
  ProxyPreserveHost On
  ProxyPass        /api/qdcms/ http://127.0.0.1:5181/api/qdcms/
  ProxyPassReverse /api/qdcms/ http://127.0.0.1:5181/api/qdcms/
  RequestHeader set X-Forwarded-Proto "https"

  # ─── Public assets (favicon, robots, …) ────────────────────
  Alias /favicon.ico /srv/sites/my-site/public/favicon.ico
  Alias /robots.txt  /srv/sites/my-site/public/robots.txt
  Alias /sitemap.xml /srv/sites/my-site/public/sitemap.xml

  # ─── SPA bundle + client-side router fallback ──────────────
  <Directory /srv/sites/my-site/frontend/dist>
    Options FollowSymLinks
    AllowOverride None
    Require all granted

    RewriteEngine On
    RewriteCond %{REQUEST_FILENAME} !-f
    RewriteCond %{REQUEST_FILENAME} !-d
    RewriteCond %{REQUEST_URI} !^/api/qdcms/
    RewriteRule ^ /index.html [L]
  </Directory>

  # Long-lived cache on hashed assets.
  <FilesMatch "\.(js|css|woff2?|ttf|eot|svg|png|jpe?g|gif|webp|ico)$">
    Header set Cache-Control "public, max-age=31536000, immutable"
  </FilesMatch>

  ErrorLog  ${APACHE_LOG_DIR}/my-site_error.log
  CustomLog ${APACHE_LOG_DIR}/my-site_access.log combined
</VirtualHost>
```

Activate :

```sh
sudo a2ensite my-site
sudo apachectl configtest && sudo systemctl reload apache2
```

## 6. SSL / TLS via Let's Encrypt

Both nginx and apache integrate with `certbot` :

```sh
# nginx
sudo certbot --nginx -d example.com -d www.example.com

# apache
sudo certbot --apache -d example.com -d www.example.com
```

Auto-renewal is set up by certbot's systemd timer ; nothing else
to do. The cert paths in the vhost above match certbot's
defaults.

## 7. Database choices

The default in the demo is SQLite for ease of setup. In
production you have three reasonable paths :

- **SQLite** — fine for low-write sites (portfolios, brochure
  sites). One file at `/var/lib/qdcms/<site>/data/site.sqlite`.
  Back up by `sqlite3 site.sqlite '.backup /backup/...'` or
  rsync at low-traffic times. Single-writer ; concurrent SPA
  visitors are fine, concurrent admin edits serialise.
- **MariaDB / MySQL** — set `QDCMS_DIALECT=mariadb` and
  `QDCMS_DB=mysql://user:pass@host:3306/dbname` in
  `<instance>/backend/.env`. Standard backup tooling
  (`mysqldump`, point-in-time, replicas).
- **PostgreSQL** — `QDCMS_DIALECT=postgres`, same env shape.
  Same backup tooling.

The migration runner is dialect-aware — same plugin manifests,
different DDL emission per dialect.

## 8. Update workflow

```sh
cd /opt/qdcms/core && git pull && npm install
cd /srv/sites/my-site && npm install     # picks up new core packages
cd /srv/sites/my-site
npx qdcms config:doctor config           # gate before deploy
cd frontend && npm run build
sudo systemctl restart qdcms@my-site
```

A `Makefile` at `/srv/sites/my-site/Makefile` wrapping these
steps is a recommended optimisation — turns the deploy into
`make deploy` with a single rollback point on failure.

## 9. Backup checklist

Three things to back up :

1. **SQL database** — `/var/lib/qdcms/<site>/data/` (or your
   external DB).
2. **Instance config + content** — `/srv/sites/<site>/config/`,
   `content/`, `public/`. These are committed to git ; the
   git repo IS your backup. Tag a release before each deploy so
   you can roll back.
3. **Compiled artefacts** — `frontend/dist/` and
   `.compiled/` — derived from source, not strictly needed in
   backup ; rebuild from source.

The instance's `node_modules/` is reproducible from
`package-lock.json`. No need to back it up.

## 10. Multi-site on one host

Drop a vhost + a systemd unit instance per site :

```sh
/srv/sites/site-a/   ← instance A
/srv/sites/site-b/   ← instance B (own backend at port 5182)

/etc/nginx/sites-available/site-a.conf
/etc/nginx/sites-available/site-b.conf

systemctl enable qdcms@site-a
systemctl enable qdcms@site-b   (port differs in its .env)
```

Each backend listens on its own port (5181, 5182, …),
reverse-proxied by its vhost. They share the same
`/opt/qdcms/core/` (one upgrade lever for all sites).

## 11. Test the deployment in the sandbox first

The sandbox (`/sandbox/`) is the canonical rehearsal venue for
production topologies. Each one slots in as a docker-compose
profile or a sibling compose file, so you can validate the full
install pipeline without touching a real host. Planned profiles
(see TODO) :

| Profile name      | Tests                                          |
|---|---|
| `nginx`           | The §4 vhost in front of the qdcms backend     |
| `apache`          | The §5 vhost in front of the qdcms backend     |
| `mariadb`         | Demo + MariaDB instead of SQLite               |
| `postgres`        | Demo + Postgres                                |
| `multi-site`      | Two instances + two vhosts on one core         |
| `tls`             | Same as nginx but with mkcert-issued cert      |

Run `make profile-nginx` / `make profile-apache` etc. to bring
up the relevant stack. The deploy steps above (build, doctor,
restart) execute identically inside the container as on the
real host — same scripts, same env vars, same exit codes. CI
gates the merge on a successful sandbox run for at least the
`nginx` profile.

The sandbox is the closest thing to "can I deploy this without
fear" we have. New topologies should land here first ; the
deploy doc gets updated alongside.

## 12. References

- [`structure.md`](./structure.md) §6 — instance layout.
- [`config.md`](./config.md) — configuration discipline (what
  to commit, what to compile).
- [`cli.md`](./cli.md) — `qdcms config:compile`,
  `:doctor`, `install` commands used by the deploy steps above.
- [`sandbox/README.md`](../sandbox/README.md) — the
  containerised dev / CI mirror of this layout (good place to
  validate a deploy script before running it on a real host).
