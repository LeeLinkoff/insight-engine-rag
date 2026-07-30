# RAG Demo VPS Deployment Summary

This project was built and tested locally first. Getting it running on a VPS required dealing with system library issues, an unusable native Node installation, Apache reverse proxying, and separating build-time vs run-time environments. This README documents exactly what was needed to make the app work reliably on the VPS.

**Note:** this process is now automated by `.github/workflows/deploy.yml`, which runs these same steps via SSH on every push to `main`. This doc remains accurate as a reference/fallback.

## 1. VPS Environment Reality

The VPS had:

* A broken / extremely old Node environment
* Missing shared libraries such as `libbrotlidec.so.1`
* No ability to run modern Node or build JS projects natively

**Conclusion:** Node must never run directly on the host. Everything Node-related must be containerized.

Docker becomes mandatory, not optional.

## 2. Backend: Fully Containerized

Backend runs only inside Docker.

### Dockerfile

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --omit=dev
COPY . .
EXPOSE 3001
CMD ["node", "server.js"]
```

### Build

```bash
docker build -t rag-backend .
```

### Run

```bash
docker run -d \
  --name rag-backend \
  --restart unless-stopped \
  -p 3001:3001 \
  --env-file .env \
  rag-backend
```

### .env

```env
OPENAI_API_KEY=...
PORT=3001
```

The moderation check run on every generated answer uses this same `OPENAI_API_KEY` via OpenAI's moderation endpoint. No additional environment variables are required to support it.

### Verification

```bash
curl http://127.0.0.1:3001/api/health
```

Must return JSON, not HTML.

## 3. Apache Reverse Proxy

Apache fronts the domain and forwards API requests to the backend container.

### Created

```
/etc/apache2/conf.d/includes/post_virtualhost_global.conf
```

### With

```apache
<IfModule mod_proxy.c>
    ProxyPreserveHost On
    ProxyPass "/api/" "http://127.0.0.1:3001/"
    ProxyPassReverse "/api/" "http://127.0.0.1:3001/"
</IfModule>
```

### Apply

```bash
apachectl configtest
systemctl restart httpd
```

### Verification

```bash
curl https://leelinkoff.com/api/health
```

Must return backend JSON.

## 4. Frontend Build Must Use Docker

Frontend cannot be built on the VPS host because Node is unusable.

The frontend `src/` is now a set of focused single-purpose components (`App.jsx` owns shared state and backend calls; `AboutCard.jsx`, `PageUrlCard.jsx`, `RoutingErrorNotice.jsx`, `HighlighterTab.jsx`, `AskQuestionTab.jsx`, `AnswerCard.jsx`, `SourcesCard.jsx`, `HighlightedPreviewCard.jsx`, `SystemCheckDialog.jsx`, `HowItWorksDialog.jsx`, `InstructionSection.jsx`, `InstructionStep.jsx`) rather than one large file, plus new Radix UI dependencies (`@radix-ui/react-tabs`, `@radix-ui/react-dialog`) for the tabs and dialogs. None of this changes the build process below, `npm install` picks up the new dependencies the same as any other package.

From `/opt/rag/frontend`:

```bash
docker run --rm -it \
  -v /opt/rag/frontend:/app \
  -w /app \
  node:20-alpine sh
```

Inside container:

```bash
npm install
npm run build
```

This generates:

```
/opt/rag/frontend/dist
```

## 5. Deploy Frontend to Apache

Static files live under:

```
/home/leelinko/public_html/mvps/rag/
```

### Deploy

```bash
rm -rf /home/leelinko/public_html/mvps/rag/*
cp -r /opt/rag/frontend/dist/* /home/leelinko/public_html/mvps/rag/
```

Apache now serves the UI.

## 6. API Routing Rule

Frontend never talks to Docker directly. It only talks to Apache:

```javascript
fetch('/api/ingest-urls')
fetch('/api/query')
fetch('/api/health')
```

Apache forwards `/api/*` → backend container.

This gives:

* No CORS problems
* No port exposure
* Clean environment separation
* Identical frontend behavior locally and on VPS

## 7. Final Architecture

```
Browser
  |
  v
Apache (HTTPS)
  |
  |-- /api/*  ---> Docker container (127.0.0.1:3001)
  |
  |-- static frontend ---> /home/leelinko/public_html/mvps/rag
```

### Backend

* Dockerized
* Restart-safe
* Independent of host OS libraries

### Frontend

* Built in Docker
* Served as static files
* Zero runtime Node dependency

## 8. TypeScript Source (Not Currently Deployed)

Type-checked TypeScript versions of the backend exist alongside the JavaScript originals (`server.ts`, `evals.ts`, `highlight-safe.ts`, `swagger-spec.ts`) and compile clean under `strict: true`, but production still runs the plain JavaScript via the Dockerfile above (`CMD ["node", "server.js"]`). Switching to the TypeScript build would require adding `RUN npx tsc` as a build step and pointing `CMD` at the compiled `dist/server.js` instead, see `DEPLOYMENT_AND_ARCHITECTURE.md` section 2.8 for the full Dockerfile diff.

## 9. What This Demonstrates

This was not "toy deployment." It required:

* Recognizing broken system-level dependencies
* Using Docker as an isolation boundary
* Designing a clean reverse-proxy interface
* Keeping frontend and backend routing consistent
* Separating build-time Node from runtime hosting
* Hardening restart behavior with `--restart unless-stopped`
* Fixing real-world Apache configuration failures
* Recovering from document-root corruption
* Eliminating double-API path issues

This is production-grade deployment thinking, not tutorial-level DevOps.