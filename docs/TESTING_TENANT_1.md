# Tenant-1 End-to-End Pipeline Test (AWS / ECR / EKS / us-east-1)

> Step-by-step guide to test the full CI/CD pipeline for **tenant-1** from feature branch
> through dev, sandbox, production, release, and rollback.
>
> **Pre-requisite**: Complete Phase 0 of `TESTING_SEQUENCE.md` (cloud setup, secrets, bootstrap).

---

## Tenant-1 Identity

| Property | Value |
|---|---|
| Cloud | AWS |
| Region | `us-east-1` |
| Registry | ECR |
| Cluster type | EKS |
| Dev cluster | `trunk-dev` |
| Sandbox cluster | `trunk-sandbox` |
| Production cluster | `trunk-prod` |
| Dev namespace | `trunk-dev-tenant-1` |
| Sandbox namespace | `trunk-sandbox-tenant-1` |
| Production namespace | `trunk-production-tenant-1` |
| Currency | USD |
| Payment gateway | stripe-us |
| Notification channel | sns |

---

## Required Secrets (verify before starting)

### Repo-level secrets

- `GH_ACTIONS_ROLE_ARN_TENANT_1` — AWS OIDC role ARN
- `ECR_REGISTRY_TENANT_1` — ECR registry URL (e.g. `123456789012.dkr.ecr.us-east-1.amazonaws.com`)
- `AWS_REGION_TENANT_1` — `us-east-1`
- `DHI_REGISTRY_TOKEN` — auth token for dhi.io

### Environment-level secrets

| GitHub Environment | Secret | Value |
|---|---|---|
| `dev-tenant-1` | `EKS_CLUSTER_NAME_DEV_TENANT_1` | `trunk-dev` |
| `sandbox-tenant-1` | `EKS_CLUSTER_NAME_SANDBOX_TENANT_1` | `trunk-sandbox` |
| `production-tenant-1` | `EKS_CLUSTER_NAME_PROD_TENANT_1` | `trunk-prod` |

---

## Step 1: DHI Base Image Sync

**Goal**: Mirror the hardened base image to tenant-1's ECR.

1. Go to **Actions → DHI Base Image Sync → Run workflow**.
2. Wait for the `sync-tenant-1` job to succeed (the other tenants run in parallel but are not your focus here).
3. Verify:
   ```bash
   aws ecr describe-images --repository-name dhi-runtime-node --region us-east-1
   ```
   Expect at least one image with tag `22-slim`.

**Stop if** `sync-tenant-1` fails — check `GH_ACTIONS_ROLE_ARN_TENANT_1`, `ECR_REGISTRY_TENANT_1`, and `DHI_REGISTRY_TOKEN`.

---

## Step 2: Create a Feature PR (CI Validation)

**Goal**: Verify CI runs lint, typecheck, tests, changeset check, and K8s manifest validation.

1. Create a feature branch:
   ```bash
   git checkout -b feat/tenant-1-test-pipeline
   ```
2. Make a small code change (e.g. add a comment in `services/api/health.ts`).
3. Add a changeset:
   ```bash
   bun changeset
   # Choose: patch
   # Summary: test tenant-1 pipeline
   ```
4. Commit and push:
   ```bash
   git add . && git commit -m "feat: test tenant-1 pipeline" && git push origin feat/tenant-1-test-pipeline
   ```
5. Open a PR targeting `main`.
6. Watch **Actions → CI**:
   - Expect: biome lint, typecheck, tests (90% coverage), changeset check — all pass.
   - Expect: K8s manifest validation passes for all 9 overlays.
7. Confirm the E2E gate created a **pending** commit status on the PR.

**Checkpoint**: CI green, PR merge blocked by E2E gate.

---

## Step 3: E2E Gate

**Goal**: Verify `/run-e2e` unblocks the merge gate.

1. Confirm the PR merge button is **disabled** (E2E Tests = pending).
2. Comment `/run-e2e` on the PR (you must be MEMBER, OWNER, or COLLABORATOR).
3. Watch **Actions → E2E Run** start.
   - It checks out the exact PR head SHA and runs `bun run test:e2e`.
4. After completion, verify:
   - Commit status badge is **clickable** and links to the workflow run.
   - Status = `success` → merge button is now **enabled**.
5. *(Optional)* Cancel a run mid-flight and confirm the status becomes `failure`, not stuck `pending`.

**Checkpoint**: PR is mergeable.

---

## Step 4: Merge to Main → Auto Dev Deploy

**Goal**: Merge the PR and verify tenant-1's dev environment receives the deployment.

1. Have a reviewer approve the PR (or bypass if branch protection allows for testing).
2. **Squash and merge** the PR into `main`.
3. Watch **Actions → Deploy to Dev** start automatically.
   - The `tenant-1` matrix job builds 4 images (`trunk-api`, `trunk-orders`, `trunk-notifications`, `trunk-payments`).
   - Images are pushed to ECR with SHA tags.
   - The workflow applies `k8s/overlays/tenant-1/dev`.
4. Verify images were pushed:
   ```bash
   # SHA = first 7 chars of the merge commit
   aws ecr describe-images --repository-name trunk-api-dev-tenant-1 --region us-east-1
   ```
5. Verify pods are running:
   ```bash
   kubectl config use-context <your-eks-trunk-dev-context>
   kubectl get pods -n trunk-dev-tenant-1
   ```
   **(k9s)** `:` → `ctx` → EKS trunk-dev context, `:` → `ns` → `trunk-dev-tenant-1`, `:` → `pod` — all 4 service pods should be **Running**.
6. Verify smoke test passed in the workflow logs. Manually port-forward to verify:
   ```bash
   kubectl port-forward deployment/trunk-api 4000:4000 -n trunk-dev-tenant-1
   curl http://localhost:4000/health
   ```
   **(k9s)** `:` → `deploy`, select `trunk-api`, `Shift-F`, set local:4000 → container:4000, then `curl`.
7. Verify ConfigMap values:
   ```bash
   kubectl get configmap trunk-config -n trunk-dev-tenant-1 -o yaml
   ```
   Expect: `TENANT=tenant-1`, `CLOUD=aws`, `REGION=us-east-1`, `NODE_ENV=development`.

**Checkpoint**: tenant-1 dev running with SHA-tagged images. All 4 services healthy.

---

## Step 5: Version Packages (Release Version Bump)

**Goal**: Verify the release workflow creates the "Version Packages" PR.

1. The push to `main` also triggered **Actions → Release**. Check it ran.
2. Go to **Pull Requests** tab. A PR titled **"Version Packages"** should exist.
3. Review the PR:
   - `package.json` version bumped (e.g. `0.1.0` → `0.1.1` for a patch changeset).
   - `CHANGELOG.md` updated with the changeset summary.
   - `.changeset/*.md` files consumed (deleted).
4. **Merge** the "Version Packages" PR (squash or regular merge).
5. Confirm `package.json` on `main` now shows the new version (e.g. `0.1.1`).

> **Note**: This merge to `main` will trigger another `Deploy to Dev`. That is expected — it's
> a no-op for service code since only `package.json` and `CHANGELOG.md` changed, but the workflow
> still runs path detection and may rebuild if the root changed.

**Checkpoint**: `package.json` = `0.1.1`. No changeset files remain in `.changeset/`.

---

## Step 6: Deploy to Sandbox

**Goal**: Deploy tenant-1 to sandbox. Verify RC tags and Trivy scan.

1. Go to **Actions → Deploy to Sandbox → Run workflow**:
   | Input | Value |
   |---|---|
   | `ref` | `main` |
   | `tenant` | `tenant-1` |
   | `services` | `all` |
   | `run_migrations` | unchecked |
   | `skip_validation` | unchecked |
2. Watch the workflow:
   - Validation job runs lint, typecheck, tests.
   - Build-and-push creates images tagged `<sha>` and `v0.1.1-rc.<run_number>`.
   - Trivy scans each image for CRITICAL vulnerabilities.
   - Overlay `k8s/overlays/tenant-1/sandbox` is applied (2 replicas, PDB `minAvailable: 1`).
3. Verify images:
   ```bash
   aws ecr describe-images --repository-name trunk-api-sandbox-tenant-1 --region us-east-1
   # Expect tags: <sha>, v0.1.1-rc.<N>
   ```
4. Verify pods:
   ```bash
   kubectl config use-context <your-eks-trunk-sandbox-context>
   kubectl get pods -n trunk-sandbox-tenant-1
   ```
   **(k9s)** `:` → `ctx` → EKS trunk-sandbox, `:` → `ns` → `trunk-sandbox-tenant-1`, `:` → `pod`.
   Expect **2 replicas** per service (8 pods total), all Running.
5. Verify PDB:
   ```bash
   kubectl get pdb -n trunk-sandbox-tenant-1
   ```
   Expect `minAvailable: 1` for each service.
6. Manually verify services via port-forward:
   ```bash
   kubectl port-forward deployment/trunk-api 4000:4000 -n trunk-sandbox-tenant-1
   curl http://localhost:4000/health
   ```

**Checkpoint**: tenant-1 sandbox running `v0.1.1-rc.<N>` images. 2 replicas per service. Trivy passed.

---

## Step 7: Deploy to Production

**Goal**: Deploy tenant-1 to production. Verify stable tags, Trivy (CRITICAL+HIGH), and release creation.

1. Go to **Actions → Deploy to Production → Run workflow**:
   | Input | Value |
   |---|---|
   | `ref` | `main` |
   | `tenant` | `tenant-1` |
   | `services` | `all` |
   | `run_migrations` | unchecked |
2. The `production-tenant-1` environment will pause for **required reviewer approval** — approve it.
3. Watch the workflow:
   - Pre-deploy checks run.
   - Build-and-push creates images tagged `<sha>`, `v0.1.1`, and `latest`.
   - Trivy scans for CRITICAL + HIGH vulnerabilities.
   - Overlay `k8s/overlays/tenant-1/production` is applied (3 replicas, PDB `minAvailable: 2`, topology spread).
   - Rollout wait is **strict** — a stalled rollout fails the job.
   - Smoke test runs against `trunk-api`.
4. Verify images:
   ```bash
   aws ecr describe-images --repository-name trunk-api --region us-east-1
   # Expect tags: <sha>, v0.1.1, latest
   ```
5. Verify pods and topology spread:
   ```bash
   kubectl config use-context <your-eks-trunk-prod-context>
   kubectl get pods -n trunk-production-tenant-1 -o wide
   ```
   Expect **3 replicas** per service (12 pods total). The NODE column should show pods distributed across different nodes.
   **(k9s)** `:` → `ctx` → EKS trunk-prod, `:` → `ns` → `trunk-production-tenant-1`, `:` → `pod` — verify NODE spread.
6. Verify PDB:
   ```bash
   kubectl get pdb -n trunk-production-tenant-1
   ```
   Expect `minAvailable: 2` for each service.
7. After all deploys succeed, `publish-release` runs:
   - Git tag `v0.1.1` is created and pushed.
   - GitHub Release is created with auto-generated notes.
8. Verify:
   ```bash
   git fetch --tags
   git tag --list
   # Should include: v0.1.1
   ```
9. Check the **Releases** tab in GitHub — a release for `v0.1.1` should exist.

**Checkpoint**: tenant-1 production running `v0.1.1`. 3 replicas, topology spread active. Git tag and GitHub Release created.

---

## Step 8: Test Rollback

**Goal**: Roll back one service in tenant-1 production and verify isolation.

1. Go to **Actions → Rollback → Run workflow**:
   | Input | Value |
   |---|---|
   | `tenant` | `tenant-1` |
   | `environment` | `production` |
   | `service` | `api` |
   | `target_revision` | *(leave empty — rolls back to previous ReplicaSet)* |
2. Watch the workflow run `kubectl rollout undo deployment/trunk-api -n trunk-production-tenant-1`.
3. Verify:
   ```bash
   kubectl rollout history deployment/trunk-api -n trunk-production-tenant-1
   kubectl describe deployment trunk-api -n trunk-production-tenant-1 | grep Image
   ```
   **(k9s)** `:` → `deploy`, select `trunk-api`, `d` — check Image in describe.
4. Confirm smoke test passed in the workflow.
5. **Verify isolation**: other services (`trunk-orders`, `trunk-notifications`, `trunk-payments`) in tenant-1 production are unaffected:
   ```bash
   kubectl get pods -n trunk-production-tenant-1
   ```
   Only `trunk-api` pods should have restarted.

**Checkpoint**: `trunk-api` rolled back in tenant-1 production. Other services unaffected.

---

## Step 9: Second Feature PR + Version Bump (Differential Deploy)

**Goal**: Prove tenant-1 can advance to a new version independently.

1. Create another feature branch:
   ```bash
   git checkout main && git pull
   git checkout -b feat/tenant-1-second-feature
   ```
2. Make a small change, add a **minor** changeset:
   ```bash
   bun changeset
   # Choose: minor
   # Summary: test tenant-1 differential deploy
   ```
3. Push, open PR, pass CI + E2E gate, then squash merge.
4. Wait for `Deploy to Dev` to complete (all tenants get the dev deploy).
5. Merge the new "Version Packages" PR → version becomes `0.2.0`.
6. Deploy **only tenant-1** through sandbox and production:

   **Sandbox**:
   | Input | Value |
   |---|---|
   | `ref` | `main` |
   | `tenant` | `tenant-1` |
   | `services` | `all` |
   | `run_migrations` | unchecked |
   | `skip_validation` | unchecked |

   **Production** (after sandbox is green):
   | Input | Value |
   |---|---|
   | `ref` | `main` |
   | `tenant` | `tenant-1` |
   | `services` | `all` |
   | `run_migrations` | unchecked |

7. After production succeeds, `publish-release` creates tag `v0.2.0`.
8. Verify tenant-1 is on the new version:
   ```bash
   kubectl describe deployment trunk-api -n trunk-production-tenant-1 | grep Image
   # → ...trunk-api:v0.2.0
   ```

**Checkpoint**: tenant-1 is on `v0.2.0`. Other tenants remain on `v0.1.1`.

---

## Verification Summary

After completing all steps, confirm for tenant-1:

- [ ] DHI base image synced to ECR (`dhi-runtime-node:22-slim`)
- [ ] CI validated PR (lint, typecheck, tests, changeset, K8s manifests)
- [ ] E2E gate blocked merge until `/run-e2e` passed
- [ ] Dev deploy triggered automatically on merge to main
- [ ] Dev images tagged with `<sha>` only
- [ ] "Version Packages" PR created and merged (version bumped)
- [ ] Sandbox deploy: images tagged `<sha>` + `v<version>-rc.<N>`
- [ ] Sandbox: 2 replicas, PDB `minAvailable: 1`, Trivy CRITICAL scan passed
- [ ] Production deploy: images tagged `<sha>` + `v<version>` + `latest`
- [ ] Production: 3 replicas, PDB `minAvailable: 2`, topology spread, Trivy CRITICAL+HIGH
- [ ] Git tag `v<version>` and GitHub Release created after production deploy
- [ ] Rollback of single service worked; other services unaffected
- [ ] Differential deploy: tenant-1 advanced independently to `v0.2.0`
- [ ] ConfigMap `trunk-config` in each namespace has `TENANT=tenant-1`, `CLOUD=aws`, `REGION=us-east-1`

---

## Teardown (when done)

```bash
export AWS_REGION=us-east-1

# Delete EKS clusters (includes VPC and NAT gateways)
for cluster in trunk-prod trunk-sandbox trunk-dev; do
  eksctl delete cluster --name "$cluster" --region "$AWS_REGION" --wait
done

# Verify nothing billable remains
aws eks list-clusters --region us-east-1
aws ec2 describe-nat-gateways --region us-east-1 --filter Name=state,Values=available,pending

# Optional: delete ECR repositories
for repo in $(aws ecr describe-repositories --region us-east-1 --query 'repositories[?starts_with(repositoryName,`trunk-`) || repositoryName==`dhi-runtime-node`].repositoryName' --output text); do
  aws ecr delete-repository --repository-name "$repo" --region us-east-1 --force
done
```
