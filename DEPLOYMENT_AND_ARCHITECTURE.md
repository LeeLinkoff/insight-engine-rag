# RAG MVP VPS Deployment and Architecture

This project was built and tested locally first. Getting it running on a VPS required dealing with system library issues, an unusable native Node installation, Apache reverse proxying, and separating build-time vs run-time environments. This document covers exactly what was needed to make the app work reliably on the VPS.

---

# PART 1: DEPLOYMENT

---

## 1.1 Connecting to the VPS

All commands in this document must be run from an active SSH session on the VPS.

### Option 1: Bluehost cPanel Terminal (no extra software required)
1. Go to https://my.bluehost.com and log in
2. Click "Hosting" in the top navigation
3. Click "cPanel" next to your hosting plan
4. Scroll down to the "Advanced" section
5. Click "Terminal"
6. You are now in an SSH session on the VPS

### Option 2: PuTTY (Windows)
- Host: YOUR_VPS_IP
- User: root
- Port: 22

### Verify you are in the right place

    whoami

Should return: root

---

## 1.2 Uploading Files to the VPS

Use SFTP (FileZilla or WinSCP) to upload source files before running any build commands.

| Local path | VPS destination |
|---|---|
| `frontend/` | `$PROJECT/frontend/` |
| `backend/` | `$PROJECT/backend/` |

Do not upload `node_modules/`, `dist/`, or `.env`. These are either built on the VPS or must be created manually.

---

## 1.3 Pre-Flight: Session Setup

Run these once at the start of every SSH session before doing anything else.

### Set your project root

Replace the path with wherever you uploaded the repo on the VPS:

    PROJECT=/opt/rag

All commands in this document use `$PROJECT` so nothing else needs to change.

### Remove the cp alias

The VPS shell aliases `cp` to `cp -i` by default, which causes interactive prompts on every file overwrite. Kill it for the session:

    unalias cp

To make this permanent, add `unalias cp` to `/root/.bashrc` and run `source /root/.bashrc`.

---

## 1.4 Frontend Deployment

### Step 1: Build the frontend

    cd $PROJECT/frontend
    docker run --rm -it -v $PROJECT/frontend:/app -w /app node:20-alpine sh

Inside the container:

    npm install
    npm run build
    exit

This writes the production build to `$PROJECT/frontend/dist/` on the VPS filesystem via the mounted volume. The container is discarded after exit. The `dist/` folder stays on disk.

### Step 2: Deploy to Apache

    cp -rT $PROJECT/frontend/dist /home/leelinko/public_html/mvps/rag

Apache serves the UI immediately. No Apache restart required. The proxy configuration is already in place and static file serving is always live.

### Step 3: Verify frontend

Open in a browser:

    https://leelinkoff.com/mvps/rag/

The UI should load. If it appears blank or broken, check that `vite.config.js` has the correct base path (see Section 1.6).

---

## 1.5 Backend Deployment

### Step 1: Build and start the backend container

    cd $PROJECT/backend
    docker rm -f rag-backend
    docker build -t rag-backend .
    docker run -d \
      --name rag-backend \
      --restart unless-stopped \
      -p 3001:3001 \
      --env-file .env \
      rag-backend

### Step 2: Verify backend is running directly

    curl http://127.0.0.1:3001/api/health

Must return JSON:

    {"ok":true,"chunks":0,"sources":{}}

`chunks:0` is expected on a fresh start. Content is loaded at runtime when the user clicks Load Page in the UI.

### Step 3: Verify backend through Apache end-to-end

    curl https://leelinkoff.com/api/health

Must return the same JSON as above. If this fails but the direct curl in Step 2 succeeded, the Apache proxy configuration has an issue.

---

## 1.6 IMPORTANT: Vite Base Path

When the frontend is not served from the root of the domain, the following must be set in `vite.config.js`:

    base: '/mvps/rag/'

Without this, all asset paths will be wrong and the app will appear blank or broken.

---

# PART 2: ARCHITECTURE

---

## 2.1 VPS Environment Reality

The VPS had:

* A broken and extremely old Node environment
* Missing shared libraries such as `libbrotlidec.so.1`
* No ability to run modern Node or build JS projects natively

Conclusion: Node must never run directly on the host. Everything Node-related must be containerized.

Docker becomes mandatory, not optional.

---

## 2.2 Frontend Architecture

The frontend is a React/Vite app. It cannot be built on the VPS host because Node is broken there.

Instead, a throwaway Docker container is used as a build environment. The frontend source directory is mounted into the container as a volume. When `npm run build` writes the `dist/` output, it writes directly to the VPS filesystem through the mount. The container exits and is discarded, but the `dist/` folder remains on disk.

This means:

* The container provides the Node runtime and build tools
* The VPS filesystem provides persistent storage
* No Node ever runs on the VPS host directly

### Frontend directory structure on VPS

    $PROJECT/frontend/
      src/              <- React source files (uploaded via SFTP)
      dist/             <- Vite build output (generated by Docker build step)
      package.json
      vite.config.js

### Apache serves static files from

    /home/leelinko/public_html/mvps/rag/

---

## 2.3 Backend Architecture

The backend is a Node.js/Express server that runs exclusively inside Docker. The VPS host never executes Node directly.

### Dockerfile

    FROM node:20-alpine
    WORKDIR /app
    COPY package.json package-lock.json ./
    RUN npm install --omit=dev
    COPY . .
    EXPOSE 3001
    CMD ["node", "server.js"]

`--omit=dev` excludes devDependencies from the production image, keeping it lean.

### .env

    OPENAI_API_KEY=...
    PORT=3001

Note: Never commit `.env`. It must be in `.gitignore`. Create it manually on the VPS after uploading source files.

### How Docker image and container relate

- `$PROJECT/backend` contains the source files and Dockerfile. This is the blueprint.
- `docker build` reads the blueprint and creates a named image stored internally by Docker under `/var/lib/docker/`.
- `docker run` starts a live container from that image. The container is an isolated running process.
- The source files in `$PROJECT/backend` are not mounted into the running container. They are copied in at build time. To pick up code changes, you must rebuild the image and restart the container.

---

## 2.4 Apache Reverse Proxy

Apache fronts the domain and forwards all `/api/*` requests to the backend container. This was a one-time setup and does not need to be repeated on each deploy.

Two reasons this architecture was chosen:

* No CORS problems: the frontend and API appear to the browser as the same origin, eliminating cross-origin request blocks.
* No port exposure: the backend container only listens on `127.0.0.1:3001` and is never directly reachable from the public internet. Apache is the only public-facing entry point.

### Config file location

    /etc/httpd/conf.d/includes/post_virtualhost_global.conf

Note: This VPS uses `httpd` (Red Hat/CentOS style), not `apache2` (Debian style). The service name and config paths reflect this.

### Config contents

    <IfModule mod_proxy.c>
        ProxyPreserveHost On
        ProxyPass "/api/" "http://127.0.0.1:3001/"
        ProxyPassReverse "/api/" "http://127.0.0.1:3001/"
    </IfModule>

### To apply config changes (only needed if the proxy config itself changes)

    apachectl configtest
    systemctl restart httpd

---

## 2.5 API Routing Rule

The frontend never talks to the Docker container directly. All API calls use relative paths:

    fetch('/api/ingest-urls')
    fetch('/api/query')
    fetch('/api/health')

Apache intercepts all `/api/*` requests and proxies them to the backend container at `127.0.0.1:3001`.

This gives:

* No CORS problems
* No port exposure
* Identical frontend behavior locally (via Vite proxy) and on VPS (via Apache proxy)
* Clean separation between static file serving and API handling

---

## 2.6 Final Architecture Diagram

    Browser
      |
      v
    Apache (HTTPS) -- leelinkoff.com
      |
      |-- /api/*           --->  Docker container (127.0.0.1:3001, internal only)
      |
      |-- /mvps/rag/*      --->  /home/leelinko/public_html/mvps/rag (static files)

### Backend
* Dockerized -- isolated from host OS
* Restart-safe -- `--restart unless-stopped` brings it back after VPS reboots
* Independent of host Node installation

### Frontend
* Built inside Docker using a throwaway container
* Deployed as static files served directly by Apache
* Zero runtime Node dependency on the VPS host

---

## 2.7 Security Notes

* `OPENAI_API_KEY` must stay in `.env` and never be committed to the repository. Always verify `.env` is in `.gitignore` before any `git push`.
* No rate limiting is currently implemented on `/api/ingest-urls` or `/api/query`. For a public MVP this means anyone who finds the endpoint can run up OpenAI API costs. Add rate limiting before any production hardening.
* Running as root on the VPS is acceptable for an MVP but should be changed to a dedicated non-root user before any production deployment.
* The backend container binds to `127.0.0.1:3001`, not `0.0.0.0:3001`. This means port 3001 is not reachable from the public internet. Only Apache can reach it locally. Do not change this binding.

---

## 2.8 What This Demonstrates

This was not toy deployment. It required:

* Recognizing broken system-level dependencies
* Using Docker as an isolation boundary for both build and runtime
* Designing a clean reverse-proxy interface
* Keeping frontend and backend routing consistent across local and VPS environments
* Separating build-time Node from runtime hosting
* Hardening restart behavior with `--restart unless-stopped`
* Fixing real-world Apache configuration issues
* Recovering from document-root corruption
* Eliminating double-API path issues caused by incorrect base path configuration

This is production-grade deployment thinking, not tutorial-level DevOps.
