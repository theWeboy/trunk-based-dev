# trunk-based-dev

A minimal multi-service, multi-tenant, multi-cloud repo for validating the same CI/CD shape used in
the main TOFA repo, without carrying the full product and integration complexity.

## What this repo mirrors

- Trunk-based development with short-lived feature branches and `main` as the release trunk
- Changesets-driven versioning with a "Version Packages" PR created by `release.yml`
- Manual E2E gate using PR comment `/run-e2e`
- Automatic dev deploys on push to `main`
- Manual sandbox and production deploys
- AWS + GCP OIDC auth in GitHub Actions
- DHI-based hardened runtime images mirrored into each target registry
- Kustomize overlays with per-tenant dev, sandbox, and production environments
- Rollback workflow and per-tenant differential deployment

## Intentional simplifications

- Generic tenants: `tenant-1`, `tenant-2`, `tenant-3`
- Simple Encore services: `api`, `orders`, `notifications`, `payments`
- Lower coverage gate than TOFA: the dummy repo enforces `80%`, while TOFA uses a stricter bar
- No migration job, ESO, Vault, or open-banking integrations
- The `api` deployment still uses inline init retry logic; it does not yet mirror TOFA's shared
  `wait-for-tcp.sh` helper

## Repository layout

```text
trunk-based-dev/
├── .github/workflows/     # CI, E2E gate, dev/sandbox/prod deploy, release, rollback, DHI sync
├── docs/                  # End-to-end operator/testing guides
├── k8s/
│   ├── base/             # One Deployment + Service per service
│   ├── encore/           # Encore infra configs per environment/cloud
│   └── overlays/         # tenant-{1,2,3} × {dev,sandbox,production}
├── services/
│   ├── api/
│   ├── orders/
│   ├── notifications/
│   └── payments/
├── e2e/                  # Playwright E2E tests
├── test/                 # Vitest/unit tests
├── scripts/localstack/   # Local infra helpers
├── .changeset/
├── encore.app
├── regsync.yaml
└── package.json
```

## Local development

### Install

```bash
git clone <repo-url> trunk-based-dev
cd trunk-based-dev
bun install
```

### Run locally

```bash
bun run dev
```

### Validate locally

```bash
bun run biome check
bun run typecheck
bun run test:run
bun run test:e2e
```

### Add a changeset for app changes

When a PR changes application code, CI expects a changeset unless you deliberately use the
`skip-changeset` PR label.

```bash
bun changeset
```

## GitHub setup for full pipeline testing

### Required environments

Create these GitHub environments:

- `sandbox-tenant-1`
- `sandbox-tenant-2`
- `sandbox-tenant-3`
- `production-tenant-1`
- `production-tenant-2`
- `production-tenant-3`

Require reviewers on the `production-*` environments.

### Required repository secrets

```text
# DHI sync
DHI_REGISTRY_TOKEN=<token>
# or
DHI_REGISTRY_USERNAME=<username>
DHI_REGISTRY_PASSWORD=<password>

# tenant-1 (AWS / EKS / ECR)
GH_ACTIONS_ROLE_ARN_TENANT_1=arn:aws:iam::<ACCOUNT_ID>:role/github-actions-role
ECR_REGISTRY_TENANT_1=<account_id>.dkr.ecr.us-east-1.amazonaws.com
AWS_REGION_TENANT_1=us-east-1
EKS_CLUSTER_NAME_DEV_TENANT_1=trunk-dev
EKS_CLUSTER_NAME_SANDBOX_TENANT_1=trunk-sandbox
EKS_CLUSTER_NAME_PROD_TENANT_1=trunk-prod

# tenant-2 (GCP / GKE / GAR)
GCP_WORKLOAD_IDENTITY_PROVIDER_TENANT_2=projects/<NUM>/locations/global/workloadIdentityPools/<POOL>/providers/<PROVIDER>
GCP_SERVICE_ACCOUNT_EMAIL_TENANT_2=github-actions@<PROJECT>.iam.gserviceaccount.com
GAR_REGISTRY_TENANT_2=us-central1-docker.pkg.dev/<PROJECT>/trunk
GKE_CLUSTER_NAME_DEV_TENANT_2=trunk-dev
GKE_CLUSTER_NAME_SANDBOX_TENANT_2=trunk-sandbox
GKE_CLUSTER_NAME_PROD_TENANT_2=trunk-prod
GKE_REGION_TENANT_2=us-central1

# tenant-3 (GCP / GKE / GAR)
GCP_WORKLOAD_IDENTITY_PROVIDER_TENANT_3=projects/<NUM>/locations/global/workloadIdentityPools/<POOL>/providers/<PROVIDER>
GCP_SERVICE_ACCOUNT_EMAIL_TENANT_3=github-actions@<PROJECT>.iam.gserviceaccount.com
GAR_REGISTRY_TENANT_3=europe-west1-docker.pkg.dev/<PROJECT>/trunk
GKE_CLUSTER_NAME_DEV_TENANT_3=trunk-dev
GKE_CLUSTER_NAME_SANDBOX_TENANT_3=trunk-sandbox
GKE_CLUSTER_NAME_PROD_TENANT_3=trunk-prod
GKE_REGION_TENANT_3=europe-west1

# optional
SONAR_TOKEN=<sonar-token>
RELEASE_BOT_TOKEN=<github-pat-with-repo-scope>
```

### Branch protection

Protect `main` and require:

- `validate`
- `E2E Tests`

## Workflow summary

| Workflow | Trigger | Purpose |
|---|---|---|
| `ci.yml` | PR / push to `main` | Lint, typecheck, tests, changeset check, kubeconform |
| `e2e-gate.yml` | PR open/sync/reopen | Set `E2E Tests` status to pending |
| `e2e-run.yml` | PR comment `/run-e2e` | Run E2E and update commit status |
| `deploy-dev.yml` | Push to `main` / manual | Build SHA-tagged images and deploy dev |
| `deploy-sandbox.yml` | Manual | Build RC-tagged images and deploy sandbox |
| `deploy-production.yml` | Manual | Build stable tags, deploy prod, then tag + GitHub Release |
| `release.yml` | Push to `main` | Create or update the "Version Packages" PR |
| `rollback.yml` | Manual | Roll back one tenant/environment/service |
| `dhi-sync.yml` | Manual / weekly | Mirror `dhi.io/node:22-slim` to ECR and GAR |

## Operator guides

- `docs/TESTING_SEQUENCE.md` — step-by-step cloud validation runbook
- `docs/END_TO_END_DEPLOYMENT_FLOW.md` — concise PR-to-production lifecycle

## Local pipeline testing

For local validation of the Kubernetes/deployment flow, use the guides under `scripts/localstack/`
and adapt them to this repo's simpler manifests.

## License

MIT
