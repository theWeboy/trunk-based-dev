# End-to-End Testing Sequence

> **Purpose**: Step-by-step guide to manually test the complete trunk-based multi-tenant multi-cloud CI/CD flow.
> Work through all phases in order. Each phase builds on the previous one.
>
> **Short operator companion**: use `docs/EXECUTION_SHEET.md` if you want the concise run order and exact workflow inputs first, then come back here for the deeper validation checks.

> **Fidelity note**: This dummy repo now mirrors the current TOFA CI/CD and deployment behavior much
> more closely: `90%` coverage gate, changesets PR, E2E gate, dev auto-deploy, sandbox/prod manual
> promotions, AWS+GCP identity federation, conditional migration jobs, shared `wait-for-tcp.sh`
> init checks, and overlay-driven rollouts. Remaining differences are intentional business-logic
> and naming simplifications only.

---

## Tenant and Cloud Mapping

| Tenant   | Cloud | Registry | Orchestration | Region        |
|----------|-------|----------|---------------|---------------|
| tenant-1 | AWS   | ECR      | EKS           | us-east-1     |
| tenant-2 | GCP   | GAR      | GKE           | us-central1   |
| tenant-3 | GCP   | GAR      | GKE           | europe-west1  |

---

## Phase 0: One-Time Cloud Setup (Manual)

Complete this phase once before any workflow runs. Nothing is automated here.

### 0.0 Personal Bootstrap Checklist

Use this before you begin the real end-to-end exercise in your own GitHub repo plus personal AWS/GCP.

- [ ] You understand the full-fidelity test is not "free tier only". A complete run means:
  1 AWS account, 2 GCP projects, 3 registries, and 9 Kubernetes clusters or cluster environments.
- [ ] You have decided whether to do a cheaper first pass:
  create only the `dev` clusters first, stop after Phase 4, then add sandbox/production later.
- [ ] The GitHub repo is your real remote for this dummy repo, not just a local copy.
- [ ] GitHub Actions is enabled for the repo, and all workflows are visible under **Actions**.
- [ ] GitHub Actions is allowed to create pull requests and push tags/releases in this repo.
- [ ] Your GitHub user can approve protected environment deployments for `production-*`.
- [ ] Tenant-1 AWS account exists, billing is active, MFA is enabled, and you can use the AWS CLI.
- [ ] Tenant-2 and tenant-3 GCP projects exist, billing is attached, required APIs are enabled, and you can use the `gcloud` CLI.
- [ ] Tenant-1 AWS account has ECR repos for all dev, sandbox, and production image names plus `dhi-runtime-node`.
- [ ] Tenant-1 AWS account has GitHub OIDC trust configured and the role in `GH_ACTIONS_ROLE_ARN_TENANT_1` can push to ECR and get kubeconfig for EKS.
- [ ] Tenant-2 and tenant-3 GCP projects have Workload Identity Federation configured and the GitHub service accounts can push to Artifact Registry and access GKE.
- [ ] GAR repository paths in `GAR_REGISTRY_TENANT_2` and `GAR_REGISTRY_TENANT_3` exactly match the repositories you created.
- [ ] All target namespaces exist or can be created by the overlays without RBAC failures.
- [ ] `trunk-config`, `trunk-db-secret`, and `trunk-redis-secret` exist in each target namespace before the first deploy.
- [ ] Each cluster has enough schedulable capacity for the intended environment:
  dev can work with 1 node, sandbox with 2, production with 3 per tenant to satisfy topology spread.
- [ ] `dhi.io` credentials are valid so `dhi-sync.yml` can mirror `node:22-slim` before any deploy workflow runs.
- [ ] You are comfortable deleting the cloud resources afterward, because this test creates registries, clusters, workloads, and release artifacts.

### 0.1 Local Tools and Naming

Before touching any cloud console, install and verify these tools locally:

- `git`
- `gh`
- `aws`
- `gcloud`
- `kubectl`
- `kustomize`
- `docker`

Recommended naming used by this guide:

- GitHub repo: `<GITHUB_OWNER>/<GITHUB_REPO>`
- AWS region: `us-east-1`
- GCP tenant-2 region: `us-central1`
- GCP tenant-3 region: `europe-west1`
- Cluster names everywhere: `trunk-dev`, `trunk-sandbox`, `trunk-prod`
- GAR repository name: `trunk`
- AWS IAM role name: `github-actions-role`
- GCP service account name: `github-actions`

Quick local auth sanity checks:

```bash
gh auth status
aws sts get-caller-identity
gcloud auth list
kubectl version --client
```

### 0.2 GitHub Repository Setup

Do this first, because both AWS OIDC and GCP Workload Identity need the exact repository name.

1. Create a new GitHub repository, or push this codebase to an existing repo.
2. Set the default branch to `main`.
3. Open **Settings -> Actions -> General** and confirm:
   - Actions are enabled for the repository.
   - **Workflow permissions** are `Read and write`.
   - **Allow GitHub Actions to create and approve pull requests** is enabled.
4. Open **Settings -> Branches** and add branch protection for `main`:
   - Require a pull request before merging.
   - Require at least 1 approval.
   - Require branches to be up to date before merging.
   - Require status checks:
     - `validate`
     - `E2E Tests`
5. If the repo lives in an organization with restricted actions, allow the marketplace actions used in `.github/workflows`.
6. If you want to test `/run-e2e` from a second user, add that user as a collaborator. The workflow only reacts to comments from `MEMBER`, `OWNER`, or `COLLABORATOR`.

### 0.3 GitHub Environments

Create the following environments in **Settings -> Environments**.

For a personal repo, it is fine to set yourself as the required reviewer on production environments.

| Environment name        | Required reviewer |
|-------------------------|-------------------|
| `sandbox-tenant-1`      | optional          |
| `sandbox-tenant-2`      | optional          |
| `sandbox-tenant-3`      | optional          |
| `production-tenant-1`   | required          |
| `production-tenant-2`   | required          |
| `production-tenant-3`   | required          |

### 0.4 GitHub Secrets

Add these secrets at **Settings -> Secrets and variables -> Actions -> Repository secrets** after you create the cloud resources below:

```text
# DHI (Docker Hardened Images) registry
# Use either the token or username/password pair, depending on what DHI gave you.
DHI_REGISTRY_TOKEN=<your-dhi-token>

# tenant-1 (AWS us-east-1)
GH_ACTIONS_ROLE_ARN_TENANT_1=arn:aws:iam::<ACCOUNT_ID>:role/github-actions-role
ECR_REGISTRY_TENANT_1=<account_id>.dkr.ecr.us-east-1.amazonaws.com
AWS_REGION_TENANT_1=us-east-1
EKS_CLUSTER_NAME_DEV_TENANT_1=trunk-dev
EKS_CLUSTER_NAME_SANDBOX_TENANT_1=trunk-sandbox
EKS_CLUSTER_NAME_PROD_TENANT_1=trunk-prod

# tenant-2 (GCP us-central1)
GCP_WORKLOAD_IDENTITY_PROVIDER_TENANT_2=projects/<PROJECT_NUMBER>/locations/global/workloadIdentityPools/<POOL>/providers/<PROVIDER>
GCP_SERVICE_ACCOUNT_EMAIL_TENANT_2=github-actions@<PROJECT_ID>.iam.gserviceaccount.com
GAR_REGISTRY_TENANT_2=us-central1-docker.pkg.dev/<PROJECT_ID>/trunk
GKE_CLUSTER_NAME_DEV_TENANT_2=trunk-dev
GKE_CLUSTER_NAME_SANDBOX_TENANT_2=trunk-sandbox
GKE_CLUSTER_NAME_PROD_TENANT_2=trunk-prod
GKE_REGION_TENANT_2=us-central1

# tenant-3 (GCP europe-west1)
GCP_WORKLOAD_IDENTITY_PROVIDER_TENANT_3=projects/<PROJECT_NUMBER>/locations/global/workloadIdentityPools/<POOL>/providers/<PROVIDER>
GCP_SERVICE_ACCOUNT_EMAIL_TENANT_3=github-actions@<PROJECT_ID>.iam.gserviceaccount.com
GAR_REGISTRY_TENANT_3=europe-west1-docker.pkg.dev/<PROJECT_ID>/trunk
GKE_CLUSTER_NAME_DEV_TENANT_3=trunk-dev
GKE_CLUSTER_NAME_SANDBOX_TENANT_3=trunk-sandbox
GKE_CLUSTER_NAME_PROD_TENANT_3=trunk-prod
GKE_REGION_TENANT_3=europe-west1

# Optional: SonarCloud
SONAR_TOKEN=<sonar-token>
```

Important GitHub note: keep these as **repository secrets**, not environment secrets, because the workflows reference `secrets.<NAME>` at repository scope.

### 0.5 AWS Setup From Zero (tenant-1)

If you have not even created the AWS account yet, do these steps in order.

1. Create the AWS account you want to use for `tenant-1`.
2. Add a payment method and complete any identity/billing verification AWS requests.
3. Enable MFA on the root user immediately.
4. Create a normal IAM admin user or use AWS IAM Identity Center for daily work. Do not use the root user for CLI automation.
5. Install and configure the AWS CLI for that daily-use identity:
   ```bash
   aws configure
   # region: us-east-1
   ```
6. Create the GitHub OIDC identity provider in IAM:
   - Provider URL: `https://token.actions.githubusercontent.com`
   - Audience: `sts.amazonaws.com`
7. Create the `github-actions-role` IAM role with trust limited to your repository. For a first pass in a personal account, trusting the exact repo is usually the least painful safe option:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Principal": {
           "Federated": "arn:aws:iam::<ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com"
         },
         "Action": "sts:AssumeRoleWithWebIdentity",
         "Condition": {
           "StringEquals": {
             "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
           },
           "StringLike": {
             "token.actions.githubusercontent.com:sub": "repo:<GITHUB_OWNER>/<GITHUB_REPO>:*"
           }
         }
       }
     ]
   }
   ```
8. Attach an IAM policy that lets the workflow push images and discover EKS clusters:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": [
           "ecr:GetAuthorizationToken"
         ],
         "Resource": "*"
       },
       {
         "Effect": "Allow",
         "Action": [
           "ecr:BatchCheckLayerAvailability",
           "ecr:BatchGetImage",
           "ecr:CompleteLayerUpload",
           "ecr:CreateRepository",
           "ecr:DescribeImages",
           "ecr:DescribeRepositories",
           "ecr:InitiateLayerUpload",
           "ecr:ListImages",
           "ecr:PutImage",
           "ecr:UploadLayerPart"
         ],
         "Resource": [
           "arn:aws:ecr:us-east-1:<ACCOUNT_ID>:repository/trunk-*",
           "arn:aws:ecr:us-east-1:<ACCOUNT_ID>:repository/dhi-runtime-node"
         ]
       },
       {
         "Effect": "Allow",
         "Action": [
           "eks:DescribeCluster"
         ],
         "Resource": "*"
       }
     ]
   }
   ```
9. Create all required ECR repositories:
   ```bash
   for svc in api orders notifications payments; do
     aws ecr create-repository --repository-name trunk-${svc}-dev-tenant-1 --region us-east-1
     aws ecr create-repository --repository-name trunk-${svc}-sandbox-tenant-1 --region us-east-1
     aws ecr create-repository --repository-name trunk-${svc} --region us-east-1
   done
   aws ecr create-repository --repository-name dhi-runtime-node --region us-east-1
   ```
10. Create the three EKS clusters in `us-east-1`.
    The easiest repeatable path for a personal account is `eksctl` with managed nodes:
    ```bash
    eksctl create cluster --name trunk-dev --region us-east-1 --nodes 1 --node-type t3.medium
    eksctl create cluster --name trunk-sandbox --region us-east-1 --nodes 2 --node-type t3.medium
    eksctl create cluster --name trunk-prod --region us-east-1 --nodes 3 --node-type t3.medium
    ```
11. Give the GitHub OIDC role Kubernetes access to each EKS cluster. On modern EKS, the cleanest bootstrap is an access entry:
    ```bash
    ROLE_ARN="arn:aws:iam::<ACCOUNT_ID>:role/github-actions-role"
    for cluster in trunk-dev trunk-sandbox trunk-prod; do
      aws eks create-access-entry \
        --cluster-name "$cluster" \
        --principal-arn "$ROLE_ARN" \
        --type STANDARD \
        --region us-east-1 || true

      aws eks associate-access-policy \
        --cluster-name "$cluster" \
        --principal-arn "$ROLE_ARN" \
        --policy-arn arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy \
        --access-scope type=cluster \
        --region us-east-1
    done
    ```
12. Verify the role and clusters before continuing:
    ```bash
    aws ecr describe-repositories --region us-east-1
    aws eks list-clusters --region us-east-1
    ```

### 0.6 GCP Setup From Zero (tenant-2 and tenant-3)

The simplest mental model is: one GCP project per GCP tenant.

Suggested project layout:

- `tenant-2` -> one project in `us-central1`
- `tenant-3` -> one project in `europe-west1`

If you have not created the Google Cloud account/projects yet, do this for each tenant project.

1. Create or sign in to your Google account.
2. Create a Google Cloud billing account if you do not already have one.
3. Create the GCP project for the tenant and link billing.
4. Install the Cloud SDK and log in:
   ```bash
   gcloud auth login
   gcloud auth application-default login
   ```
5. Set the active project:
   ```bash
   gcloud config set project <PROJECT_ID>
   ```
6. Enable the required APIs:
   ```bash
   gcloud services enable \
     artifactregistry.googleapis.com \
     container.googleapis.com \
     iam.googleapis.com \
     iamcredentials.googleapis.com \
     cloudresourcemanager.googleapis.com
   ```
7. Create the GitHub Actions service account:
   ```bash
   gcloud iam service-accounts create github-actions \
     --display-name="GitHub Actions"
   ```
8. Grant the service account the minimum practical project roles for this dummy repo's workflows:
   ```bash
   SA="github-actions@<PROJECT_ID>.iam.gserviceaccount.com"

   gcloud projects add-iam-policy-binding <PROJECT_ID> \
     --member="serviceAccount:${SA}" \
     --role="roles/artifactregistry.writer"

   gcloud projects add-iam-policy-binding <PROJECT_ID> \
     --member="serviceAccount:${SA}" \
     --role="roles/container.admin"
   ```
   `roles/container.admin` is intentionally broad for a first personal setup. Tighten it later if you want stricter least privilege.
9. Create the Workload Identity pool and provider for GitHub Actions:
   ```bash
   PROJECT_NUMBER="$(gcloud projects describe <PROJECT_ID> --format='value(projectNumber)')"
   POOL_ID="github-pool"
   PROVIDER_ID="github-provider"

   gcloud iam workload-identity-pools create "${POOL_ID}" \
     --location="global" \
     --display-name="GitHub pool"

   gcloud iam workload-identity-pools providers create-oidc "${PROVIDER_ID}" \
     --location="global" \
     --workload-identity-pool="${POOL_ID}" \
     --display-name="GitHub provider" \
     --issuer-uri="https://token.actions.githubusercontent.com" \
     --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository"
   ```
10. Allow your exact GitHub repo to impersonate that service account:
    ```bash
    gcloud iam service-accounts add-iam-policy-binding "${SA}" \
      --role="roles/iam.workloadIdentityUser" \
      --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/attribute.repository/<GITHUB_OWNER>/<GITHUB_REPO>"
    ```
11. Create the Artifact Registry Docker repository named `trunk` in the tenant's region:
    ```bash
    # tenant-2
    gcloud artifacts repositories create trunk \
      --repository-format=docker \
      --location=us-central1

    # tenant-3
    gcloud artifacts repositories create trunk \
      --repository-format=docker \
      --location=europe-west1
    ```
12. Create the three GKE clusters per tenant.
    The easiest first pass for a personal account is regional Autopilot because it removes node-pool management:
    ```bash
    # tenant-2
    gcloud container clusters create-auto trunk-dev --region us-central1
    gcloud container clusters create-auto trunk-sandbox --region us-central1
    gcloud container clusters create-auto trunk-prod --region us-central1

    # tenant-3
    gcloud container clusters create-auto trunk-dev --region europe-west1
    gcloud container clusters create-auto trunk-sandbox --region europe-west1
    gcloud container clusters create-auto trunk-prod --region europe-west1
    ```
    If you want deterministic node-count testing for the topology-spread checks later, create Standard regional clusters instead and size them to at least dev `1`, sandbox `2`, and production `3` schedulable nodes.
13. Verify the tenant project before continuing:
    ```bash
    gcloud artifacts repositories list
    gcloud container clusters list
    ```

### 0.7 Kubernetes Bootstrap Objects

After EKS/GKE clusters are created, bootstrap the namespaces and the minimum objects each overlay expects.

1. Connect to each cluster once and create the target namespace:
   - `trunk-dev-tenant-1`
   - `trunk-sandbox-tenant-1`
   - `trunk-production-tenant-1`
   - `trunk-dev-tenant-2`
   - `trunk-sandbox-tenant-2`
   - `trunk-production-tenant-2`
   - `trunk-dev-tenant-3`
   - `trunk-sandbox-tenant-3`
   - `trunk-production-tenant-3`
2. Create the service account in each namespace:
   ```bash
   kubectl create namespace trunk-dev-tenant-1 || true
   kubectl create serviceaccount trunk-service-account -n trunk-dev-tenant-1 || true
   ```
3. Create the `trunk-config` ConfigMap in each namespace. Do not apply the full overlay yet, because that would also create workloads before image, secret, and rollout setup is ready. The simplest bootstrap path is to apply just the configmap file for each tenant/environment:
   ```bash
   kubectl apply -f k8s/overlays/tenant-1/dev/configmap.yaml
   kubectl apply -f k8s/overlays/tenant-1/sandbox/configmap.yaml
   kubectl apply -f k8s/overlays/tenant-1/production/configmap.yaml

   kubectl apply -f k8s/overlays/tenant-2/dev/configmap.yaml
   kubectl apply -f k8s/overlays/tenant-2/sandbox/configmap.yaml
   kubectl apply -f k8s/overlays/tenant-2/production/configmap.yaml

   kubectl apply -f k8s/overlays/tenant-3/dev/configmap.yaml
   kubectl apply -f k8s/overlays/tenant-3/sandbox/configmap.yaml
   kubectl apply -f k8s/overlays/tenant-3/production/configmap.yaml
   ```
4. Create `trunk-db-secret` and `trunk-redis-secret` in every namespace before your first serious deploy:
   ```bash
   kubectl create secret generic trunk-db-secret -n trunk-dev-tenant-1 \
     --from-literal=DATABASE_URL='postgres://user:password@<db-host>:5432/<db-name>' \
     --dry-run=client -o yaml | kubectl apply -f -

   kubectl create secret generic trunk-redis-secret -n trunk-dev-tenant-1 \
     --from-literal=REDIS_URL='redis://<redis-host>:6379' \
     --dry-run=client -o yaml | kubectl apply -f -
   ```
5. If you do not yet have real Postgres/Redis services, be aware of the behavior:
   - the init checks skip when `DATABASE_URL` or `REDIS_URL` is absent
   - the migration job also skips its DB connectivity pre-check when `DATABASE_URL` is absent
   - the application may still fail at runtime if your code path actually requires those services
6. Before using GitHub Actions, make sure your local admin identity can do a full dry run on each cluster:
   ```bash
   kubectl auth can-i '*' '*' --all-namespaces
   kubectl get ns
   ```

### 0.8 Lowest-Cost Personal Test Paths

If your goal is "prove the workflow design works without paying for the full production-like footprint",
use one of these staged paths.

#### Option A: Cheapest possible GitHub-only rehearsal

Use this if you want to validate the PR flow, E2E gate, branch protection, and Version Packages behavior
before creating any cloud resources.

What you create:

- GitHub repository
- branch protection
- GitHub Actions permissions
- environments

What you skip for now:

- AWS account setup
- GCP project setup
- all registries
- all clusters

How far you go:

1. Complete `0.1` through `0.4` for GitHub only.
2. Run Phase 2.
3. Run Phase 3.
4. Stop before Phase 4.

Important: do **not** merge to `main` yet. This repo auto-runs `Deploy to Dev` on push to `main`, and that job expects all three tenants to be configured.

What this proves:

- CI runs correctly
- `E2E Tests` blocks merge until `/run-e2e`
- collaborator/maintainer comment triggering works
- branch protection is wired correctly

What this does **not** prove:

- registry login
- image builds and pushes
- cloud OIDC/WIF
- Kubernetes deploys

#### Option B: Cheapest real multi-cloud deploy rehearsal

Use this if you want one actual deployment pass, but still want to avoid sandbox and production costs.

What you create now:

- tenant-1 AWS account with:
  - GitHub OIDC role
  - required ECR repositories
  - `trunk-dev` EKS cluster only
- tenant-2 GCP project with:
  - Workload Identity Federation
  - `trunk` Artifact Registry
  - `trunk-dev` GKE cluster only
- tenant-3 GCP project with:
  - Workload Identity Federation
  - `trunk` Artifact Registry
  - `trunk-dev` GKE cluster only
- only the `dev` namespaces, configmaps, and secrets
- only the `dev` cluster-name secrets in GitHub

What you skip for now:

- `trunk-sandbox` clusters
- `trunk-prod` clusters
- sandbox/prod namespaces and secrets
- production reviewer approvals in actual use

How far you go:

1. Complete GitHub setup.
2. Create all three registries.
3. Create only the three `dev` clusters.
4. Add only these cloud secrets:
   - `GH_ACTIONS_ROLE_ARN_TENANT_1`
   - `ECR_REGISTRY_TENANT_1`
   - `AWS_REGION_TENANT_1`
   - `EKS_CLUSTER_NAME_DEV_TENANT_1`
   - `GCP_WORKLOAD_IDENTITY_PROVIDER_TENANT_2`
   - `GCP_SERVICE_ACCOUNT_EMAIL_TENANT_2`
   - `GAR_REGISTRY_TENANT_2`
   - `GKE_CLUSTER_NAME_DEV_TENANT_2`
   - `GKE_REGION_TENANT_2`
   - `GCP_WORKLOAD_IDENTITY_PROVIDER_TENANT_3`
   - `GCP_SERVICE_ACCOUNT_EMAIL_TENANT_3`
   - `GAR_REGISTRY_TENANT_3`
   - `GKE_CLUSTER_NAME_DEV_TENANT_3`
   - `GKE_REGION_TENANT_3`
   - `DHI_REGISTRY_TOKEN`
5. Run Phase 1.
6. Run Phase 2.
7. Run Phase 3.
8. Merge once and run Phase 4.
9. Stop there.

Important: do **not** run sandbox or production workflows until you have created the missing cluster-name
secrets and the corresponding clusters.

What this proves:

- GitHub-to-cloud auth works for AWS and GCP
- DHI mirror works to ECR and both GAR registries
- push to `main` triggers the 3-tenant dev deployment
- image build, push, kubeconfig, and overlay apply work in each cloud

What this does **not** prove:

- RC/stable tagging behavior in real deploy runs
- environment approvals
- production Trivy gate
- rollback and differential promotion at production scope

#### Option C: Expand only when the previous stage passes

Recommended order for a budget-conscious personal test:

1. Start with Option A.
2. If GitHub flow looks good, move to Option B.
3. Only after Option B is green, create sandbox clusters and secrets, then run Phase 6.
4. Only after sandbox is green, create production clusters and secrets, then run Phase 7 onward.

#### Cost-control habits

Regardless of which option you choose:

- Prefer deleting clusters after each test round rather than leaving them idle.
- Treat sandbox and production as temporary validation environments, not long-lived personal environments.
- Save workflow logs, pushed tags, and screenshots so you do not need to repeat expensive phases just for evidence capture.
- If you only want CI/E2E confidence, stopping after Phase 3 is the cheapest meaningful checkpoint.

---

## Phase 1: DHI Base Image Sync

**Goal**: Mirror `dhi.io/node:22-slim` to all three registries so Encore builds can use it.

1. Go to **Actions → DHI Base Image Sync → Run workflow**.
2. Wait for all 3 jobs (`sync-tenant-1`, `sync-tenant-2`, `sync-tenant-3`) to succeed.
3. Verify:
   ```bash
   # tenant-1
   aws ecr describe-images --repository-name dhi-runtime-node --region us-east-1
   # tenant-2
   gcloud artifacts docker images list us-central1-docker.pkg.dev/<PROJECT>/trunk/dhi-runtime-node
   # tenant-3
   gcloud artifacts docker images list europe-west1-docker.pkg.dev/<PROJECT>/trunk/dhi-runtime-node
   ```

**Checkpoint**: DHI base image present in all 3 registries.

---

## Phase 2: First PR — CI Validation

**Goal**: Verify lint, typecheck, tests, changeset check, and K8s manifest validation all pass.

1. Create a feature branch:
   ```bash
   git checkout -b feat/test-ci-pipeline
   ```
2. Make a small code change (e.g., update a comment in `services/api/health.ts`).
3. Add a changeset:
   ```bash
   bun changeset
   # Choose: patch
   # Summary: test CI pipeline
   ```
4. Commit and push:
   ```bash
   git add . && git commit -m "feat: test CI pipeline" && git push origin feat/test-ci-pipeline
   ```
5. Open a PR targeting `main`.
6. Watch the CI workflow run: **Actions → CI**.
   - Expect: biome, typecheck, tests (90% coverage) all pass.
   - Expect: changeset check passes (`.changeset/*.md` present).
   - Expect: K8s manifest validation passes for all 9 overlays.
7. Verify the E2E gate created a **pending** commit status on the PR ("E2E Tests: Comment /run-e2e to trigger").

**Checkpoint**: CI green, E2E gate pending.

---

## Phase 3: E2E Gate

**Goal**: Verify that the E2E gate blocks merge and that `/run-e2e` unblocks it.

1. Confirm the PR's merge button is **disabled** (E2E Tests = pending).
2. Comment `/run-e2e` on the PR (only MEMBER, OWNER, or COLLABORATOR comments trigger the run — external forks will not trigger it).
3. Watch **Actions → E2E Run** start automatically.
   - It checks out the exact commit SHA from the PR head (not the branch tip) and runs `bun run test:e2e`.
   - The commit status updates to "Running E2E tests..." while running.
4. After E2E completes, verify the commit status badge on the PR is **clickable** and links directly to the workflow run. This confirms `target_url` is being set correctly.
5. Check the outcome:
   - Success → merge button becomes **enabled**.
   - Failure → fix the issue, push new commits (gate resets to pending), re-run `/run-e2e`.
6. **Test cancellation handling (optional)**: Cancel the E2E run mid-flight. Verify the commit status is set to `failure` (not left stuck as `pending`).

**Checkpoint**: E2E Tests = success, PR is mergeable, status badge is clickable.

---

## Phase 4: Merge to main and Dev Deploy

**Goal**: Merge the PR and verify auto-deploy to all 3 dev environments.

1. Have a reviewer approve the PR.
2. **Squash and merge** the PR into `main`.
3. Watch **Actions → Deploy to Dev** start automatically (triggered by push to main).
   - 3 matrix jobs run in parallel: `tenant-1`, `tenant-2`, `tenant-3`.
   - Each builds 4 images, pushes to the respective registry, injects image tags via `kustomize edit set image`, and applies the overlay.
   - If `migrations/**` changed, the workflow also recreates and waits on `job/trunk-api-migrate` in each target namespace.
   - Concurrency note: push-triggered runs use group `deploy-dev-all` and serialize. Manual `workflow_dispatch` runs with a specific tenant use group `deploy-dev-<tenant>` and do not block other tenants.
4. Verify images were pushed:
   ```bash
   # tenant-1 (SHA = first 7 chars of the merge commit)
   aws ecr describe-images --repository-name trunk-api-dev-tenant-1
   # Expected tags: <sha>   (no "dev-latest" — only the immutable SHA tag is pushed to dev)
   ```
5. Verify pods are running:
   ```bash
   # tenant-1
   kubectl get pods -n trunk-dev-tenant-1
   # tenant-2
   kubectl get pods -n trunk-dev-tenant-2
   # tenant-3
   kubectl get pods -n trunk-dev-tenant-3
   ```
6. The workflow auto-smoke-tests `trunk-api` with 5 fixed 5-second retries. In dev this is
   intentionally non-fatal, matching TOFA's current behavior. Verify the other services manually by
   port-forwarding each deployment separately:
   ```bash
   kubectl port-forward -n trunk-dev-tenant-1 deployment/trunk-api 4000:4000 &
   curl http://localhost:4000/health
   kill %1

   kubectl port-forward -n trunk-dev-tenant-1 deployment/trunk-orders 4000:4000 &
   curl http://localhost:4000/orders/health
   kill %1

   kubectl port-forward -n trunk-dev-tenant-1 deployment/trunk-notifications 4000:4000 &
   curl http://localhost:4000/notifications/health
   kill %1

   kubectl port-forward -n trunk-dev-tenant-1 deployment/trunk-payments 4000:4000 &
   curl http://localhost:4000/payments/health
   kill %1
   ```
   > Unlike TOFA's single-service management deployment, this dummy repo has one deployment per
   > service. Each health check should be exercised against its own deployment.

7. **Verify startup probe sequencing (optional)**: Confirm that Kubernetes uses the startup probe window before handing off to liveness/readiness.
   1. Watch events on a freshly deployed pod:
      ```bash
      kubectl describe pod -n trunk-dev-tenant-1 -l app=trunk-api | grep -A5 Events
      ```
   2. Expect: no liveness or readiness failures during boot. The startup probe fires every 5s; only after it passes once do readiness and liveness begin.
   3. To observe the full window deliberately: temporarily make `/health` return a non-200 for the first 30s of startup (e.g., via a feature flag), then watch `kubectl get pod -w`. The pod should stay in `Running` (not `CrashLoopBackOff`) for up to 5 minutes before failing — confirming the 60-attempt budget is respected.
   4. Under normal conditions the startup probe passes on the first or second attempt. The 5-minute window exists only as a safety net for slow cold starts (ESO secret sync, DB migration on first deploy, etc.).

8. **Test init container deadline (optional)**: Verify that a permanently broken dependency causes a
   bounded failure rather than an infinite wait.
   1. Temporarily create or patch the secret used by `database-check` with an unreachable host:
      ```bash
      kubectl create secret generic trunk-db-secret -n trunk-dev-tenant-1 \
        --from-literal=DATABASE_URL='postgres://u:p@192.0.2.1:5432/db' \
        --dry-run=client -o yaml | kubectl apply -f -
      ```
   2. Delete the `trunk-api` pod to force a restart:
      ```bash
      kubectl delete pod -n trunk-dev-tenant-1 -l app=trunk-api
      ```
   3. Watch the init container logs:
      ```bash
      kubectl logs -n trunk-dev-tenant-1 -l app=trunk-api -c database-check -f
      ```
4. Expect fixed retry lines from `wait-for-tcp.sh`, then a bounded timeout.
      ```
      Database not ready at <host>:5432 — retry N, elapsed <x>s/120s
      Timed out waiting for Database after 120s — check DATABASE_URL and network
      ```
   5. Confirm the pod never becomes `Running`/`1/1 Ready`, and use `kubectl describe pod` if the
      short `STATUS` column does not show `CrashLoopBackOff`.
   6. Restore the secret with the correct `DATABASE_URL` and delete the pod again to recover.

**Checkpoint**: All 4 services running in dev for all 3 tenants, images tagged with `<sha>`.

---

## Phase 5: Version Packages (Assign Release Version)

**Goal**: Verify the release workflow creates the "Version Packages" PR.

1. After Phase 4, check **Actions → Release**. It should have run automatically on the push to `main`.
   - The `release` job has a 10-minute timeout. If `changesets/action` hangs (e.g., a GitHub API issue), the job will fail cleanly rather than block the runner indefinitely.
2. Check the **Pull Requests** tab. A PR titled **"Version Packages"** should exist.
3. Review the PR: it bumps `package.json` from `0.1.0` → `0.1.1` (patch) and updates `CHANGELOG.md`.
4. Merge the "Version Packages" PR.
5. Verify `package.json` version is now `0.1.1` on `main`.

**Checkpoint**: `package.json` version is `0.1.1`. No changeset files remain in `.changeset/`.

---

## Phase 6: Sandbox Deploy

**Goal**: Deploy to sandbox (pre-production) for all tenants. Verify RC image tags and Trivy scan.

1. Go to **Actions → Deploy to Sandbox → Run workflow**.
   - `ref`: `main`
   - `tenant`: `all`
   - `services`: `all`
   - `run_migrations`: unchecked
   - `skip_validation`: unchecked
2. Watch the workflow. Validate job runs lint/typecheck/tests first.
3. Build-and-push creates images tagged:
   - `<sha>`, `v0.1.1-rc.<run_number>`  (no `sandbox-latest` — only immutable tags are pushed)
4. Trivy scans each service image — should pass (no CRITICAL vulnerabilities in the DHI base image).
5. Verify sandbox pods:
   ```bash
   kubectl get pods -n trunk-sandbox-tenant-1
   kubectl get pods -n trunk-sandbox-tenant-2
   kubectl get pods -n trunk-sandbox-tenant-3
   ```
6. The workflow auto-smoke-tests `trunk-api` with 5 fixed 5-second retries and fails on exhaustion.
   Verify the other services manually with the same port-forward pattern used in Phase 4.
7. **Test rollout failure detection**: The `kubectl rollout status` step in sandbox is **strict** (no `|| true`). A stalled rollout will fail the job. To verify this protection works, temporarily set an invalid image tag, trigger a deploy, and confirm the job fails at rollout wait rather than proceeding to smoke test.

   > **Sandbox PDB note**: The sandbox overlay applies a PDB with `minAvailable: 1` per service. Sandbox runs at 2 replicas, so a rolling deploy can always evict one pod while one remains available. This is intentional — it lets you exercise the PDB code path without the risk of blocking voluntary node evictions the way a `minAvailable: 2` budget would when only 2 replicas are running.

**To test a blocked Trivy scan (optional)**: Temporarily change `--severity CRITICAL` to a lower threshold to see a failure.

**Checkpoint**: Sandbox running `v0.1.1-rc.<N>` images for all tenants.

---

## Phase 7: Production Deploy

**Goal**: Deploy to production. Verify stable `vX.Y.Z` tags, Trivy (CRITICAL+HIGH), smoke tests, git tag, and GitHub Release.

1. Go to **Actions → Deploy to Production → Run workflow**.
   - `ref`: `main`
   - `tenant`: `all`
   - `services`: `all`
   - `run_migrations`: unchecked
2. The `production-*` environments will pause for **required reviewer approval** — approve each.
3. Build-and-push creates images tagged: `<sha>`, `v0.1.1`, `latest`
4. Trivy runs with `CRITICAL,HIGH` — must be clean to proceed.
5. Each tenant's deploy applies the production overlay (3 replicas, PDB `minAvailable: 2`, topology spread constraints).
6. **Verify topology spread (optional)**: Confirm pods landed on separate nodes:
   ```bash
   kubectl get pods -n trunk-production-tenant-1 -o wide
   # NODE column should show 3 distinct node names across all 4 services
   ```
   To verify AZ spread (if the cluster spans multiple zones):
   ```bash
   kubectl get pods -n trunk-production-tenant-1 -o json \
     | jq -r '.items[] | [.metadata.name, .spec.nodeName] | @tsv' \
     | while read pod node; do
         zone=$(kubectl get node "$node" -o jsonpath='{.metadata.labels.topology\.kubernetes\.io/zone}')
         echo "$pod → $node ($zone)"
       done
   ```
   **What to expect**: Each service's 3 pods should be on 3 different nodes (hard constraint). AZ distribution is best-effort — pods prefer different zones but will co-locate in the same zone if the cluster doesn't span AZs.
   **If a pod stays Pending**: The hard node constraint (`DoNotSchedule`) could not be satisfied — likely fewer than 3 schedulable nodes are available. Check `kubectl describe pod` for `FailedScheduling` events and verify the cluster has ≥3 nodes via `kubectl get nodes`.
6. `kubectl rollout status` is **strict** in production — a stalled rollout fails the job immediately.
7. The workflow smoke-tests `trunk-api` with 5 fixed 5-second retries and fails on exhaustion.
   Manually verify the other services after deploy using port-forwarding if you want full
   multi-service confidence.
8. After all deploys succeed, `publish-release` job runs:
   - Reads the version from the `build-and-push` job output (not re-reading `package.json` at publish time, eliminating a TOCTOU window).
   - Git tag `v0.1.1` is created and pushed (idempotent — safe to re-run if already tagged).
   - GitHub Release is created with auto-generated notes.
9. Verify:
   ```bash
   git fetch --tags
   git tag --list
   # Should include: v0.1.1
   ```
10. Check **Releases** tab in GitHub.

**Checkpoint**: `v0.1.1` deployed to production for all 3 tenants, git tag and Release created.

---

## Phase 8: Rollback

**Goal**: Test the rollback workflow — undo the last deploy for one tenant/service.

1. Go to **Actions → Rollback → Run workflow**.
   - `tenant`: `tenant-1`
   - `environment`: `production`
   - `service`: `api`
   - `target_revision`: (leave empty to roll back to previous ReplicaSet)
2. Watch the workflow run `kubectl rollout undo deployment/trunk-api -n trunk-production-tenant-1`.
3. Verify the previous image is running:
   ```bash
   kubectl rollout history deployment/trunk-api -n trunk-production-tenant-1
   kubectl describe deployment trunk-api -n trunk-production-tenant-1 | grep Image
   ```
4. Smoke test confirms `/health` still returns 200.
5. **Verify isolation**: confirm `trunk-orders`, `trunk-notifications`, `trunk-payments` in tenant-1 production, and all services in tenant-2/tenant-3, are unaffected.

   > Rollback concurrency is scoped per `tenant + environment + service` — rolling back `trunk-api` in `production` for `tenant-1` does not block a simultaneous rollback of `trunk-orders` in the same environment.

**Checkpoint**: tenant-1 production api rolled back. Other services and tenants unaffected.

---

## Phase 9: Multi-Tenant Differential Deploy

**Goal**: Demonstrate that tenant-1 and tenant-2 can be on different versions simultaneously.

1. Merge another feature PR with a changeset (`minor` bump).
2. Merge the new "Version Packages" PR → version becomes `0.2.0`.
3. Deploy to sandbox for `tenant-1` only (verify, then deploy to production):
   ```
   Deploy to Sandbox: ref=main, tenant=tenant-1
   Deploy to Production: ref=main, tenant=tenant-1
   ```
4. After the `tenant-1` production deploy completes, the `publish-release` job creates tag `v0.2.0` and a GitHub Release. When you subsequently deploy tenant-2/3, `publish-release` finds the tag already exists and skips the push (idempotent).
5. tenant-1 is now on `v0.2.0`. tenant-2 and tenant-3 are still on `v0.1.1`.
6. Verify:
   ```bash
   # tenant-1
   kubectl describe deployment trunk-api -n trunk-production-tenant-1 | grep Image
   # → ...trunk-api:v0.2.0

   # tenant-2 (should still be v0.1.1)
   kubectl describe deployment trunk-api -n trunk-production-tenant-2 | grep Image
   # → ...trunk-api:v0.1.1
   ```
7. To deploy `tenant-2` and `tenant-3` later at `v0.2.0`:
   ```
   Deploy to Production: ref=main (or ref=v0.2.0), tenant=tenant-2
   Deploy to Production: ref=main (or ref=v0.2.0), tenant=tenant-3
   ```

**Checkpoint**: Confirmed that tenants can be on different versions simultaneously. Git tag `v0.2.0` exists and is idempotent across subsequent tenant deploys.

---

## Phase 10: Hotfix (Optional)

**Goal**: Test fixing a bug that only affects one tenant's production.

1. Create a hotfix branch from `main`:
   ```bash
   git checkout -b fix/hotfix-tenant-1-issue
   ```
2. Fix the bug, add a patch changeset.
3. Open PR → CI + E2E gate → merge.
4. Merge "Version Packages" → `v0.2.1`.
5. Deploy only to tenant-1 production:
   ```
   Deploy to Sandbox: ref=main, tenant=tenant-1
   Deploy to Production: ref=main, tenant=tenant-1
   ```
6. tenant-2 and tenant-3 remain on their previous version.

---

## Verification Checklist

After completing all phases, confirm:

- [ ] CI runs on every PR: lint, typecheck, tests, changeset check, K8s validation
- [ ] E2E gate blocks merge; `/run-e2e` comment unblocks it (only MEMBER/OWNER/COLLABORATOR)
- [ ] E2E commit status badge is clickable (links to the workflow run)
- [ ] E2E cancellation sets status to `failure`, not `pending`
- [ ] dev deploy triggers automatically on push to main (all 3 tenants, changed services or all 4 when shared/root files change)
- [ ] dev images tagged with `<sha>` only (no `dev-latest`)
- [ ] dev concurrency: push-to-main serializes as `deploy-dev-all`; per-tenant dispatch runs independently
- [ ] "Version Packages" PR created automatically by release.yml (timeout: 10 min)
- [ ] `trunk-api-migrate` runs when `migrations/**` changes or `run_migrations=true`
- [ ] Sandbox deploy: images tagged `<sha>` and `v<version>-rc.<N>` (no `sandbox-latest`)
- [ ] Sandbox rollout failure fails the job (strict `kubectl rollout status`, no `|| true`)
- [ ] Production deploy: images tagged `<sha>`, `v<version>`, `latest`
- [ ] Production rollout failure fails the job
- [ ] Git tag `v<version>` and GitHub Release created after successful production deploy (idempotent on re-run)
- [ ] Rollback workflow reverts a single service in a single tenant without affecting others
- [ ] Rollback input `service` uses the bare service name (e.g. `api`) and the workflow resolves `deployment/trunk-<service>`
- [ ] Differential deploy: tenant-1 on v0.2.0 while tenant-2/3 stay on v0.1.1
- [ ] All 9 namespaces (`trunk-{dev,sandbox,production}-{tenant-1,tenant-2,tenant-3}`) created and healthy
- [ ] ConfigMap `trunk-config` in each namespace has correct `TENANT`, `CLOUD`, `REGION` values
- [ ] Production pods spread across distinct nodes — `kubectl get pods -o wide` shows no two pods of the same service sharing a NODE value
- [ ] No `FailedScheduling` events in production (cluster has ≥3 schedulable nodes per tenant)
- [ ] Startup probe fires every 5s with a 60-attempt (5-minute) budget; no liveness or readiness failures observed during normal pod boot
- [ ] `trunk-api` init containers (`database-check`, `redis-check`) use shared `wait-for-tcp.sh` with fixed retry intervals and fail within the configured timeout when the dependency is unreachable

---

## Secrets Quick Reference

| Secret name | Used in | Purpose |
|-------------|---------|---------|
| `DHI_REGISTRY_TOKEN` | dhi-sync | Auth to pull from dhi.io |
| `GH_ACTIONS_ROLE_ARN_TENANT_1` | deploy-* | AWS OIDC role for tenant-1 |
| `ECR_REGISTRY_TENANT_1` | deploy-*, dhi-sync | ECR registry URL |
| `AWS_REGION_TENANT_1` | dhi-sync | AWS region (default: us-east-1) |
| `EKS_CLUSTER_NAME_{DEV,SANDBOX,PROD}_TENANT_1` | deploy-*, rollback | EKS cluster names |
| `GCP_WORKLOAD_IDENTITY_PROVIDER_TENANT_2` | deploy-*, dhi-sync, rollback | GCP WIF provider for tenant-2 |
| `GCP_SERVICE_ACCOUNT_EMAIL_TENANT_2` | deploy-*, dhi-sync, rollback | GCP SA email for tenant-2 |
| `GAR_REGISTRY_TENANT_2` | deploy-*, dhi-sync | GAR registry URL for tenant-2 |
| `GKE_CLUSTER_NAME_{DEV,SANDBOX,PROD}_TENANT_2` | deploy-*, rollback | GKE cluster names for tenant-2 |
| `GKE_REGION_TENANT_2` | deploy-*, rollback | GKE region (default: us-central1) |
| `GCP_WORKLOAD_IDENTITY_PROVIDER_TENANT_3` | deploy-*, dhi-sync, rollback | GCP WIF provider for tenant-3 |
| `GCP_SERVICE_ACCOUNT_EMAIL_TENANT_3` | deploy-*, dhi-sync, rollback | GCP SA email for tenant-3 |
| `GAR_REGISTRY_TENANT_3` | deploy-*, dhi-sync | GAR registry URL for tenant-3 |
| `GKE_CLUSTER_NAME_{DEV,SANDBOX,PROD}_TENANT_3` | deploy-*, rollback | GKE cluster names for tenant-3 |
| `GKE_REGION_TENANT_3` | deploy-*, rollback | GKE region (default: europe-west1) |
| `SONAR_TOKEN` | ci | SonarCloud SAST (optional) |
| `GITHUB_TOKEN` | all | Automatically provided by GitHub Actions |
