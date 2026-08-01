# TODO / Future Work

## Partial automation for OpenAI API key rotation

**Status:** Not implemented. Current rotation is fully manual (update the
`OPENAI_API_KEY` GitHub Actions secret by hand, then push to `main` or run
`workflow_dispatch`, which pushes the new key to the VPS automatically via
`deploy.yml`). See `DEPLOYMENT_AND_ARCHITECTURE.md` section 1.6.

**Proposed improvement:** collapse the manual dashboard-to-secret copy step
into a single on-demand script, without adding a scheduled/automatic trigger.

### What it would do

1. Call OpenAI's Admin API to create a new project service account, which
   returns a usable secret key directly in the response:

       POST https://api.openai.com/v1/organization/projects/{project_id}/service_accounts
       Authorization: Bearer $OPENAI_ADMIN_KEY
       { "name": "Production App" }

2. Write that new key's value into the `OPENAI_API_KEY` GitHub repository
   secret via the GitHub API or `gh secret set`.
3. Trigger `deploy.yml` (or let the next natural push handle it), which
   pushes the new key to the VPS and restarts the backend container, same
   mechanism as today.
4. After confirming `/api/health` responds correctly on the new key, delete
   the old service account via the Admin API to retire the old key.

### What it requires that doesn't exist yet

- An OpenAI **Admin API key** (`OPENAI_ADMIN_KEY`), a separate credential
  from the regular `OPENAI_API_KEY`, generated once by an organization
  owner in the OpenAI dashboard, then stored as its own GitHub secret.
- A GitHub **personal access token** with permission to write repository
  secrets (the default `GITHUB_TOKEN` in Actions cannot write secrets),
  also stored as its own secret.

### Why this is on-demand, not scheduled

Deliberately not building this as a cron-triggered workflow. This key
protects an MVP with no sensitive data behind it, isn't shared across a
team, and has no offboarding trigger, the risk it guards against is
accidental exposure, not high-value automation abuse. Event-driven
rotation (run the script if the key is ever suspected leaked, or just
periodically by choice) covers the actual risk here without introducing
a second standing credential (`OPENAI_ADMIN_KEY`) and a secret-writing
PAT sitting in the repo for a job that runs unattended. Revisit this
decision only if the key's blast radius changes, e.g. if this project
starts handling real user data or scales beyond an MVP.
