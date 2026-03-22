# End-to-End Deployment Flow: trunk-based-dev

> Purpose: a concise reference for how this dummy repo moves from feature branch to dev, sandbox,
> production, and rollback across all three tenants.
>
> Companion guide: `docs/TESTING_SEQUENCE.md` is the hands-on runbook. This file is the shorter
> conceptual overview.
>
> Operator sheet: `docs/EXECUTION_SHEET.md` is the shortest version, focused on run order and exact
> workflow inputs.

---

## Tenant mapping

| Tenant | Cloud | Registry | Cluster type | Region |
|---|---|---|---|---|
| `tenant-1` | AWS | ECR | EKS | `us-east-1` |
| `tenant-2` | GCP | GAR | GKE | `us-central1` |
| `tenant-3` | GCP | GAR | GKE | `europe-west1` |

---

## 1. Happy path

### Phase 1: Feature PR

1. Developer creates a short-lived branch from `main`.
2. Developer updates code and tests.
3. Developer adds a changeset for application-facing changes.
4. Developer opens a PR to `main`.

What runs:

- `ci.yml` validates lint, typecheck, tests, changeset presence, and rendered Kustomize overlays.
- `e2e-gate.yml` sets `E2E Tests` to `pending`.

Result:

- The PR is not mergeable until `/run-e2e` succeeds.

### Phase 2: Manual E2E gate

1. Reviewer approves the PR.
2. A maintainer or collaborator comments `/run-e2e`.
3. `e2e-run.yml` checks out the PR head SHA and runs E2E.
4. The `E2E Tests` commit status becomes `success` or `failure`.

Result:

- Merge is enabled only after E2E succeeds on the exact PR head commit.

### Phase 3: Merge to `main` and dev deploy

1. PR is squash-merged to `main`.
2. `deploy-dev.yml` runs automatically.

What the workflow does:

- Detects changed services
- Builds SHA-tagged images with `encore build docker`
- Uses the mirrored hardened base image `dhi-runtime-node:22-slim`
- Pushes to ECR or GAR per tenant
- Injects image tags into the correct tenant overlay
- Applies `k8s/overlays/<tenant>/dev`
- Runs `trunk-api-migrate` when migrations changed or were forced
- Waits for rollout and smoke-tests `trunk-api`

Result:

- Dev environments move to immutable `:<sha>` images.
- No semantic release tag is created yet.

### Phase 4: Version Packages PR

1. Push to `main` also triggers `release.yml`.
2. Changesets creates or updates a PR titled `Version Packages`.
3. When that PR is merged, `package.json` and `CHANGELOG.md` are updated.

Important:

- This step assigns the release version.
- It does not create a git tag.
- Git tagging happens only after successful production deploy.

### Phase 5: Sandbox deploy

1. Operator runs `deploy-sandbox.yml` manually.
2. Inputs are typically:
   - `ref=main`
   - `tenant=all`
   - `services=all`
   - `run_migrations=false`
   - `skip_validation=false`

What the workflow does:

- Re-runs validation unless `skip_validation=true`
- Auto-detects changed services when `services=all`
- Builds images tagged with both `:<sha>` and `:v<version>-rc.<run_number>`
- Runs blocking Trivy on `CRITICAL`
- Applies `k8s/overlays/<tenant>/sandbox`
- Runs `trunk-api-migrate` when migrations changed or were forced
- Waits for rollout and smoke-tests `trunk-api`

Result:

- Sandbox is the pre-production proving ground for the exact release candidate.

### Phase 6: Production deploy

1. Operator runs `deploy-production.yml` manually.
2. GitHub environment approval gates the production jobs.

What the workflow does:

- Re-runs pre-deploy checks
- Auto-detects changed services when `services=all`
- Builds production images tagged `:<sha>`, `:v<version>`, and `:latest`
- Runs blocking Trivy on `CRITICAL,HIGH`
- Applies `k8s/overlays/<tenant>/production`
- Runs `trunk-api-migrate` when migrations changed or were forced
- Waits for rollout and smoke-tests `trunk-api`
- Creates git tag `v<version>` and a GitHub Release after deploy success

Result:

- Production runs the stable semantic version for the selected tenants.

---

## 2. Tagging model

| Environment | Tags pushed | Meaning |
|---|---|---|
| Dev | `:<sha>` | Immutable commit deployment |
| Sandbox | `:<sha>`, `:v<version>-rc.<run_number>` | Release-candidate build |
| Production | `:<sha>`, `:v<version>`, `:latest` | Stable release build |

This matches the main repo's overall practice:

- dev stays on immutable commit tags
- sandbox uses RC tags
- production uses stable semantic tags
- git tag and GitHub Release happen after production success

---

## 3. Rollback

`rollback.yml` rolls back one deployment in one tenant/environment scope.

Inputs:

- `tenant`
- `environment`
- `service`
- optional `target_revision`

Behavior:

1. Authenticates to the correct cloud
2. Builds kubeconfig for the target cluster
3. Runs `kubectl rollout undo`
4. Waits for rollout
5. Runs a smoke test for the rolled-back service

Concurrency is scoped to:

- `tenant + environment + service`

So rolling back `trunk-api` in `tenant-1` production does not block a rollback for a different
tenant or service.

---

## 4. Differential deploys by tenant

This dummy repo supports the same high-level pattern as the main repo: tenants can move at different
speeds.

Examples:

- Deploy sandbox for `tenant-1` only while `tenant-2` and `tenant-3` stay unchanged
- Promote `tenant-1` to production first, then later deploy the same version to `tenant-2`
- Roll back only one tenant while others remain on the newer version

Mechanically, that works because:

- deploy workflows accept a single tenant or `all`
- overlays are tenant-specific
- images are tagged immutably
- release tagging is idempotent

---

## 5. What matches TOFA and what does not

### Matches TOFA's CI/CD and deployment model

- trunk-based PR flow with Changesets
- PR E2E gate using a manual comment trigger
- dev auto-deploy on push to `main`
- sandbox/prod manual promotion
- AWS + GCP identity federation from GitHub Actions
- hardened base image mirroring into target registries
- overlay-driven Kubernetes deploys
- conditional migration job orchestration during deploys
- fixed retry TCP wait helper shared through Kustomize configMap generation
- semantic version tags only after production success

### Intentional simplifications

- generic tenant names instead of business regions
- simpler Encore services and health checks
- a dummy `db:migrate` runner that succeeds even when no real migrations exist
- no external secret infrastructure

For your intended use, this means the dummy repo is a good place to validate the multi-service,
multi-cloud CI/CD pipeline end to end, but it is not yet a perfect runtime-behavior clone of TOFA.

---

## 6. Recommended order for cloud confidence testing

1. Run `dhi-sync.yml`
2. Validate a feature PR through CI + `/run-e2e`
3. Merge to `main` and confirm dev deploy to all tenants
4. Merge the `Version Packages` PR
5. Run sandbox deploy for all tenants
6. Run production deploy for all tenants
7. Run one rollback in a single tenant
8. Run one tenant-only promotion to confirm differential deployment behavior

That sequence will give you high confidence in the dummy repo's CI/CD architecture before you apply
the same operational model to the main repo.
