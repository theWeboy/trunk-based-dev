# CI/CD Execution Sheet

> Purpose: a sequence-wise operator sheet for running the dummy repo end to end in your own GitHub repository plus personal AWS and GCP accounts.
>
> Use this as the short execution companion to `docs/TESTING_SEQUENCE.md`. That file explains the why and the deep checks; this sheet focuses on what to run, in what order, and with which workflow inputs.
>
> For a short "what is enforced today vs what is still optional/planned" view, also see `docs/CURRENT_IMPLEMENTED_FLOW_CHECKLIST.md`.

---

## 1. Pre-Flight

Complete these checks before running any workflow:

- Confirm all GitHub Actions secrets from `docs/TESTING_SEQUENCE.md` are present.
- Confirm GitHub environments exist:
  - `sandbox-tenant-1`
  - `sandbox-tenant-2`
  - `sandbox-tenant-3`
  - `production-tenant-1`
  - `production-tenant-2`
  - `production-tenant-3`
- Confirm all ECR/GAR repositories exist for:
  - `trunk-api-dev-tenant-*`
  - `trunk-orders-dev-tenant-*`
  - `trunk-notifications-dev-tenant-*`
  - `trunk-payments-dev-tenant-*`
  - `trunk-api-sandbox-tenant-*`
  - `trunk-orders-sandbox-tenant-*`
  - `trunk-notifications-sandbox-tenant-*`
  - `trunk-payments-sandbox-tenant-*`
  - `trunk-api`
  - `trunk-orders`
  - `trunk-notifications`
  - `trunk-payments`
  - `dhi-runtime-node`
- Confirm all target clusters are reachable by GitHub OIDC identities.
- Confirm all target namespaces contain the required config and secret objects.

---

## 2. Sequence Overview

Run the pipeline in this order:

1. `DHI Base Image Sync`
2. Feature PR -> `CI`
3. PR comment -> `E2E Tests`
4. Merge to `main` -> `Deploy to Dev`
5. `Release (Version Packages)`
6. Merge `Version Packages` PR
7. `Deploy to Sandbox`
8. `Deploy to Production`
9. `Rollback`
10. Optional differential deploy test per tenant

---

## 3. Step-by-Step Sheet

### Step 1: Sync hardened base image

Workflow:
- `DHI Base Image Sync`

Inputs:
- No manual inputs

Run mode:
- `Run workflow`

Expected result:
- `sync-tenant-1`, `sync-tenant-2`, and `sync-tenant-3` succeed
- `dhi-runtime-node:22-slim` exists in all three registries

Do not continue until:
- all three mirror jobs are green

### Step 2: Open a test PR

Manual actions:

1. Create a feature branch
2. Make a very small app code change
3. Add a changeset
4. Push branch
5. Open PR to `main`

Expected workflows:
- `CI`
- `E2E Gate`

Expected result:
- CI passes
- `E2E Tests` stays `pending`

Do not continue until:
- CI is green
- PR merge is still blocked by the E2E gate

### Step 3: Trigger E2E on the PR

Workflow:
- `E2E Tests`

Trigger:
- comment `/run-e2e` on the PR

Expected result:
- the PR head SHA gets an in-progress E2E status
- the final status becomes `success`

Do not continue until:
- the PR is mergeable

### Step 4: Merge to main and let dev deploy run

Workflow:
- `Deploy to Dev`

Trigger:
- automatic on push to `main`

Expected inputs:
- none for the push-triggered path

Expected result:
- all three tenant matrix jobs run
- changed services are built, or all four if shared/root files changed
- SHA-tagged dev images are pushed
- overlays apply successfully
- `trunk-api-migrate` runs if migrations changed
- `trunk-api` smoke test runs with fixed retries

Manual follow-up:
- verify pods in:
  - `trunk-dev-tenant-1`
  - `trunk-dev-tenant-2`
  - `trunk-dev-tenant-3`

Do not continue until:
- dev deploy is green

### Step 5: Merge the version PR

Workflow:
- `Release (Version Packages)`

Trigger:
- automatic on push to `main`

Expected result:
- a PR titled `Version Packages` is created or updated

Manual action:
- review and merge the `Version Packages` PR

Do not continue until:
- `package.json` version on `main` is updated

### Step 6: Deploy to sandbox

Workflow:
- `Deploy to Sandbox`

Recommended first full run:
- `ref`: `main`
- `tenant`: `all`
- `services`: `all`
- `run_migrations`: `false`
- `skip_validation`: `false`

Expected result:
- validation job passes
- RC images are pushed using:
  - `<sha>`
  - `v<version>-rc.<run_number>`
- blocking Trivy scan passes
- overlays apply for all tenants
- `trunk-api-migrate` runs if migrations changed or was forced
- rollout wait is strict
- `trunk-api` smoke test is strict

Do not continue until:
- sandbox deploy is green for all selected tenants

### Step 7: Deploy to production

Workflow:
- `Deploy to Production`

Recommended first full run:
- `ref`: `main`
- `tenant`: `all`
- `services`: `all`
- `run_migrations`: `false`

Expected result:
- pre-deploy checks pass
- production images are pushed using:
  - `<sha>`
  - `v<version>`
  - `latest`
- blocking Trivy scan passes on `CRITICAL,HIGH`
- environment approval is required for each production tenant
- overlays apply for all selected tenants
- `trunk-api-migrate` runs if migrations changed or was forced
- rollout wait is strict
- `trunk-api` smoke test is strict
- git tag and GitHub Release are created after successful deploy

Do not continue until:
- production deploy is green
- release/tag creation succeeded

### Step 8: Test rollback

Workflow:
- `Rollback`

Recommended first rollback test:
- `tenant`: `tenant-1`
- `environment`: `production`
- `service`: `api`
- `target_revision`: leave empty

Expected result:
- `deployment/trunk-api` rolls back in `trunk-production-tenant-1`
- rollout becomes healthy again
- post-rollback smoke test passes

Do not continue until:
- rollback workflow is green

### Step 9: Test tenant-differential promotion

Goal:
- prove tenants can move independently

Recommended sequence:

1. Merge one more feature PR with a changeset
2. Merge the next `Version Packages` PR
3. Run `Deploy to Sandbox` with:
   - `ref`: `main`
   - `tenant`: `tenant-1`
   - `services`: `all`
   - `run_migrations`: `false`
   - `skip_validation`: `false`
4. Run `Deploy to Production` with:
   - `ref`: `main`
   - `tenant`: `tenant-1`
   - `services`: `all`
   - `run_migrations`: `false`
5. Verify tenant-1 is on the new version while tenant-2 and tenant-3 are still on the old one

Expected result:
- differential deploy behavior is confirmed

---

## 4. Minimal Safe Input Set

Use these values unless you intentionally want a narrower test:

### Sandbox

- `ref=main`
- `tenant=all`
- `services=all`
- `run_migrations=false`
- `skip_validation=false`

### Production

- `ref=main`
- `tenant=all`
- `services=all`
- `run_migrations=false`

### Rollback

- `tenant=tenant-1`
- `environment=production`
- `service=api`
- `target_revision=` empty

---

## 5. When To Use Narrower Inputs

Use targeted runs in these cases:

- `tenant=tenant-1` when validating AWS-only behavior first
- `tenant=tenant-2` or `tenant=tenant-3` when isolating GCP issues
- `services=api` when troubleshooting smoke tests or migration-job orchestration
- `run_migrations=true` when you want to verify the migration-job path even without a new migration commit
- `ref=vX.Y.Z` when re-deploying a known tagged version

---

## 6. Evidence To Capture

Capture this after each major phase:

- GitHub Actions run URL
- workflow input values used
- registry image tags pushed
- `kubectl get pods` for the target namespace
- `kubectl rollout history` for at least `trunk-api`
- smoke-test result
- created git tag / GitHub Release after production

---

## 7. Stop Conditions

Stop the sequence and investigate before continuing if any of the following happens:

- `DHI Base Image Sync` fails in any tenant
- CI passes but E2E status remains stuck at `pending`
- dev deploy fails image push, migration, rollout, or smoke
- sandbox or production Trivy scan fails
- sandbox or production rollout hangs
- production tag/release creation fails after a successful deploy
- rollback succeeds technically but smoke test fails

---

## 8. Final Confidence Criteria

You should consider the dummy repo ready as a production-like CI/CD rehearsal only after all of the following are true:

- hardened base image sync passed for all tenants
- PR flow passed with CI + E2E gate
- dev deploy passed for all tenants
- version PR flow worked
- sandbox deploy passed for all tenants
- production deploy passed for all tenants
- release tag and GitHub Release were created correctly
- rollback worked for at least one tenant/service
- differential tenant promotion was demonstrated successfully
