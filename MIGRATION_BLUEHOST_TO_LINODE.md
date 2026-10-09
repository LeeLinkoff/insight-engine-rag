# CI/CD Migration Postmortem (Bluehost VPS to Linode VPS)

The deploy pipeline (`.github/workflows/deploy.yml`) worked reliably on the original Bluehost cPanel VPS. After moving the site to a fresh Linode Ubuntu VPS, the same pipeline failed repeatedly, each time at a different step and usually with a symptom that pointed somewhere other than the real cause.

This document records every failure in the order it surfaced, what it looked like, what was actually wrong, how the cause was proven, and what fixed it. The goal is that the next server move, or the next person debugging this pipeline, does not have to rediscover any of it.

---

## Why it broke

The old pipeline was not portable. Nearly every step silently depended on something specific to the Bluehost box.

| Old server assumed | New server reality |
|---|---|
| Deploy logs in as `root` | Root SSH login disabled, deploy user is `lee` |
| A working deploy key in root's `authorized_keys` | `lee` had password login only, no key authorized |
| Port 22 open to the internet | SSH firewalled to a single admin IP |
| Docker installed | Docker not installed |
| cPanel EasyApache, `httpd`, `/etc/apache2/conf.d/includes/` | Stock Ubuntu Apache, `apache2`, `sites-available/` |
| Static files under `/home/leelinko/public_html` | Web root is `/var/www/leelinkoff.com/public` |
| Apache `/api/` proxy already configured | No proxy configured |

None of these were bugs on the old server. They only became visible when the server underneath changed, and they all failed at once, each one masking the next.

---

## Failures, in the order they surfaced

### 1. Local CI under `act`, server never started

**Symptom.** Running the `eval-harness` job locally with `act`, the "Start server in background" step reported success in about 150ms. The health check then failed all 20 attempts, and `cat server.log` failed with `No such file or directory`.

**Cause.** A missing `server.log` was the tell. If the server had started and crashed, the log would exist with the error in it. The file never being created means the backgrounded process died before it even performed the `> server.log` redirect. `act` runs every step as its own `docker exec` session, and a plain `nohup ... &` child did not survive that session ending. This is the explanation consistent with the before and after runs. It was not confirmed against `act`'s source.

**Fix.** Start the server in its own session with stdin detached, then verify it is alive before the health check runs.

```bash
setsid nohup node server.js > server.log 2>&1 < /dev/null &
echo $! > server.pid
sleep 2
kill -0 "$(cat server.pid)"   # fail here with the real log if it died on boot
```

**Evidence.** After the change, `server.log` and `server.pid` existed, the health check passed on the first attempt, ingest added 33 chunks, and the eval harness passed 2/2. The fix is harmless on real GitHub runners, so one version serves both.

### 2. Invalid YAML in the SSH agent step

**Symptom.** The deploy workflow could not run the "Set up SSH agent" step as written.

**Cause.** `env:` and `run:` were indented under `name:` instead of being siblings of it, which YAML rejects.

**Fix.** Corrected the indentation. The askpass heredoc was also replaced with a single `printf` so the generated script's contents are unambiguous.

### 3. rsync hung, then timed out on port 22

**Symptom.** "Sync source files to VPS" sat for nearly two minutes, then failed with `ssh: connect to host *** port 22: Connection timed out`. The SSH key had been rotated three times by this point with no change.

**Cause.** The `VPS_HOST` secret held `172.230.135.228`. The server is `172.239.135.228`. One digit. A TCP timeout happens before any key exchange, so no amount of key rotation could have affected it.

**Evidence.**

```
nslookup leelinkoff.com            -> 172.239.135.228
Test-NetConnection 172.239.135.228 -Port 22   -> TcpTestSucceeded : True
```

**Fix.** Overwrote the secret with the verified address. Secrets cannot be read back, so when in doubt, overwrite.

```
gh secret set VPS_HOST --body "172.239.135.228"
```

### 4. SSH agent step hung silently

**Symptom.** "Set up SSH agent" stalled with no output.

**Cause.** The passphrase secret no longer matched the key secret after the key rotations. When `ssh-add` gets a wrong passphrase it does not fail. It asks again, the forced askpass script returns the same wrong passphrase, and the loop never ends. The retry prompt goes to askpass, not the log, so nothing is printed.

**Fix.** Bound `ssh-add` with a timeout, made `setsid` wait for it, and fail immediately if no key ended up loaded.

```bash
setsid -w timeout 30 ssh-add ~/.ssh/deploy_key < /dev/null
ssh-add -l
```

### 5. `Error loading key: error in libcrypto`

**Symptom.** The agent step now failed fast, but with `error in libcrypto`.

**Cause.** The private key bytes in the secret could not be parsed. Common causes are CRLF line endings, a truncated paste, the wrong file, or a missing newline after the `-----END OPENSSH PRIVATE KEY-----` line. A missing final newline was later confirmed as one real cause of `invalid format` on a local key file in this project. The file looked correct in an editor while being rejected byte for byte.

**Fix.** Stopped pasting keys. Generated a dedicated deploy key, proved it logs in from a workstation before GitHub was involved, and uploaded it straight from the file.

```
ssh-keygen -t ed25519 -f github_deploy -C "github-deploy" -N ""
ssh -i github_deploy -o IdentitiesOnly=yes lee@172.239.135.228 "echo ok"
gh secret set VPS_SSH_KEY < github_deploy
```

The workflow also strips CR before writing the key, so Windows line endings can never break it again.

```bash
printf '%s\n' "$VPS_SSH_KEY" | tr -d '\r' > ~/.ssh/deploy_key
```

### 6. No usable deploy identity on the new server

**Symptom.** Investigating the key failures showed PuTTY logged in with no key file configured at all.

**Cause.** On the new server, root SSH login is disabled and `lee` authenticates by password. No key had ever been authorized for a user that is allowed to log in, so every key uploaded to GitHub was unusable regardless of format.

**Fix.** Authorized the new `github_deploy` public key in `lee`'s `~/.ssh/authorized_keys` and set `VPS_USER` to `lee`. Proven with the local `ssh -i ... "echo ok"` test before any further CI runs.

### 7. Server was never provisioned for the app

**Symptom.** A search for `backend` or `frontend` folders anywhere on the server returned nothing.

**Cause.** The app had never been deployed to this box. Three separate gaps.

- `/opt/rag` did not exist, and `/opt` is owned by root. `rsync` only creates the last folder of a destination path, and `lee` cannot create anything in `/opt`.
- Docker was not installed.
- `lee` was not in the `docker` group, so every `docker` call would fail with permission denied.

**Fix.** One-time setup.

```bash
sudo mkdir -p /opt/rag && sudo chown lee:lee /opt/rag
sudo apt install -y docker.io docker-buildx
sudo systemctl enable --now docker
sudo usermod -aG docker lee        # takes effect in new login sessions only
```

Note that `docker` group membership is effectively root on the host, so the GitHub deploy key carries that level of access.

### 8. Apache proxy missing, and a false alarm

**Cause.** The old proxy lived in a cPanel-specific include file. On Ubuntu it belongs in the HTTPS vhost that Certbot created. The old rule also stripped `/api` from the path, but the backend serves its routes under `/api/` (for example `/api/health`, proven by the CI health check against port 3001 directly).

**Fix.** Added to the `<VirtualHost *:443>` block in `/etc/apache2/sites-available/leelinkoff.com-le-ssl.conf`, after `</Directory>`.

```apache
ProxyPreserveHost On
ProxyPass        "/api/" "http://127.0.0.1:3001/api/"
ProxyPassReverse "/api/" "http://127.0.0.1:3001/api/"
```

`mod_proxy` and `mod_proxy_http` were already enabled.

**False alarm.** While checking the vhost, the `ServerAlias` line appeared as `[www.leelinkoff.com](https://www.leelinkoff.com)`. That came from text being auto-linked when pasted into a chat window, not from the file. A `sed` rewrite produced identical-looking output, which exposed it, and `grep -c '\['` on the file confirmed no brackets existed. Lesson. Verify the bytes on the server, not text that has passed through a renderer.

### 9. Old-server assumptions hardcoded in `deploy.yml`

**Cause.** Several steps still targeted the Bluehost layout.

- `known_hosts` held the correct host key, but filed under the name `leelinkoff.com`. ssh connects to the IP in `VPS_HOST`, finds no matching entry, and with no terminal to answer the prompt, fails host key verification.
- The static frontend was synced to `/home/leelinko/public_html/mvps/rag`, which does not exist. The new target's parent `mvps` also did not exist.
- The backend container was published with `-p 3001:3001`, which binds every interface. Docker's own iptables rules bypass ufw, so the API would have been reachable directly on the public IP, skipping Apache.
- The "Write backend .env" step was duplicated.

**Fix.**

- known_hosts entry keyed to `${{ secrets.VPS_HOST }}` so it always matches the address actually used.
- Added an ssh config with `BatchMode yes` and `ConnectTimeout 15`, so every later ssh and rsync call fails fast with a real error instead of hanging.
- Static target changed to `/var/www/leelinkoff.com/public/mvps/rag`, with `mkdir -p` first.
- Container published as `-p 127.0.0.1:3001:3001`.
- Duplicate step removed.

### 10. Timeout again, with the correct host

**Symptom.** With the right IP, a verified key, and a correct `known_hosts`, rsync still failed with `Connection timed out` on port 22, now in 15 seconds thanks to `ConnectTimeout`.

**Cause.** The server firewall allowed SSH only from a single admin IP. Port 22 answered from that machine and silently dropped everything else, including GitHub's runner. GitHub-hosted runners get a new VM from a large, changing pool of Azure addresses on every run, so a fixed allowlist is not workable on the free plan.

**Evidence.** TCP to port 22 succeeded from the admin machine and timed out from the runner, with host, port, and key all independently verified. `ufw status verbose` showed the single-source rule.

**Fix.** Opened port 22. Alternatives that keep the lockdown are listed under follow-ups.

### 11. `Connection closed by *** port 22`

**Symptom.** Failure changed from a timeout to an immediate close. Progress, since sshd was now reachable.

**Cause.** The server's SSH log showed exactly what happened.

```
Accepted publickey for lee from <runner> ... ED25519 SHA256:yNA8...
drop connection #14 from [<runner>]:25633 ... Maxstartups
```

The deploy key worked. The backend rsync logged in and finished. Within minutes of port 22 opening, internet scanners were holding unauthenticated connections open for up to two minutes each. sshd's default `MaxStartups` begins randomly dropping new connections once 10 are pending, and the frontend rsync's connection lost.

**Fix.** Server side only, no workflow change.

```bash
# /etc/ssh/sshd_config.d/10-flood.conf
LoginGraceTime 20
MaxStartups 100:30:200
```

Verified with `sshd -t` and `sshd -T`, then `systemctl reload ssh`. The next run deployed end to end, including the health check through `https://leelinkoff.com/api/health`.

---

## Lessons

- **A missing artifact is evidence.** A log file that was never created, a connection that never completes the TCP handshake, and an auth failure are three different problems. Identify which layer failed before changing anything.
- **Timeouts are not auth problems.** Rotating keys cannot fix a connection that never reaches sshd.
- **Prove credentials locally before CI uses them.** `ssh -i key user@host "echo ok"` would have saved most of the key churn.
- **Never paste keys.** Upload them from the file with `gh secret set NAME < file`.
- **Make every remote call fail fast.** `BatchMode`, `ConnectTimeout`, and a timeout on `ssh-add` turned silent hangs into readable errors.
- **The server log answers what the client cannot.** `journalctl -u ssh` named the exact reason for the dropped connection.
- **Workflows should key off secrets, not hardcoded hostnames or paths,** so the next server move is a secrets update rather than a rewrite.

---

## Current state and follow-ups

The pipeline deploys successfully to the Linode VPS. Open items, none blocking.

- **Port 22 is open to the internet and `lee` accepts passwords.** Options, roughly in order of effort. Allow password authentication only from the admin IP via an sshd `Match Address` block and keys everywhere else. Install fail2ban. Or keep port 22 locked and give the runner private access instead, through Tailscale or a self-hosted runner on the VPS.
- **The deploy key carries root-equivalent access** through the `docker` group. Acceptable for a single-purpose box, worth knowing.
- **GitHub Actions annotations.** Node 20 actions are deprecated and currently forced onto Node 24, and `ubuntu-latest` moves to Ubuntu 26 starting October 19, 2026. If a run breaks around then, check those first.
