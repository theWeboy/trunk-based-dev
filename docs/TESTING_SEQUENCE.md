# End-to-End Testing Sequence

> **Purpose**: Step-by-step guide to manually test the complete trunk-based multi-tenant multi-cloud CI/CD flow.
> Work through all phases in order. Each phase builds on the previous one.
>
> **Short operator companion**: use `docs/EXECUTION_SHEET.md` if you want the concise run order and exact workflow inputs first, then come back here for the deeper validation checks.
>
> **After testing:** delete cloud resources when you no longer need them — **EKS/GKE control planes, nodes, and NAT gateways bill by the hour** until removed. Follow [Complete teardown (AWS and GCP)](#complete-teardown-aws-and-gcp) so ongoing charges stop.

> **Fidelity note**: This dummy repo now mirrors the current TOFA CI/CD and deployment behavior much
> more closely: `90%` coverage gate, changesets PR, E2E gate, dev auto-deploy, sandbox/prod manual
> promotions, AWS+GCP identity federation, conditional migration jobs, shared `wait-for-tcp.sh`
> init checks, and overlay-driven rollouts. Remaining differences are intentional business-logic
> and naming simplifications only.

**Teardown help:** [Teardown notes](#teardown-notes) (under [Complete teardown](#complete-teardown-aws-and-gcp)) explains what still bills vs optional IAM cleanup, and what to do if a cluster delete fails.

---

## Tenant and Cloud Mapping


| Tenant   | Cloud | Registry | Orchestration | Region       |
| -------- | ----- | -------- | ------------- | ------------ |
| tenant-1 | AWS   | ECR      | EKS           | us-east-1    |
| tenant-2 | GCP   | GAR      | GKE           | us-central1  |
| tenant-3 | GCP   | GAR      | GKE           | europe-west1 |


---

## Phase 0: One-Time Cloud Setup (Manual)

Complete this phase once before any workflow runs. Nothing is automated here.

### 0.0 Personal Bootstrap Checklist

Use this before you begin the real end-to-end exercise in your own GitHub repo plus personal AWS/GCP.

- You understand the full-fidelity test is not "free tier only". A complete run means:
1 AWS account, 2 GCP projects, 3 registries, and 9 Kubernetes clusters or cluster environments.
- You have decided whether to do a cheaper first pass:
create only the `dev` clusters first, stop after Phase 4, then add sandbox/production later.
- The GitHub repo is your real remote for this dummy repo, not just a local copy.
- GitHub Actions is enabled for the repo, and all workflows are visible under **Actions**.
- GitHub Actions is allowed to create pull requests and push tags/releases in this repo.
- Your GitHub user can approve protected environment deployments for `production-`*.
- Tenant-1 AWS account exists, billing is active, MFA is enabled, and you can use the AWS CLI.
- Tenant-2 and tenant-3 GCP projects exist, billing is attached, required APIs are enabled, and you can use the `gcloud` CLI.
- Tenant-1 AWS account has ECR repos for all dev, sandbox, and production image names plus `dhi-runtime-node`.
- Tenant-1 AWS account has GitHub OIDC trust configured and the role in `GH_ACTIONS_ROLE_ARN_TENANT_1` can push to ECR and get kubeconfig for EKS.
- Tenant-2 and tenant-3 GCP projects have Workload Identity Federation configured and the GitHub service accounts can push to Artifact Registry and access GKE.
- GAR repository paths in `GAR_REGISTRY_TENANT_2` and `GAR_REGISTRY_TENANT_3` exactly match the repositories you created.
- All target namespaces exist or can be created by the overlays without RBAC failures.
- `trunk-config`, `trunk-db-secret`, and `trunk-redis-secret` exist in each target namespace before the first deploy.
- Each cluster has enough schedulable capacity for the intended environment:
dev can work with 1 node, sandbox with 2, production with 3 per tenant to satisfy topology spread.
- `dhi.io` credentials are valid so `dhi-sync.yml` can mirror `node:22-slim` before any deploy workflow runs.
- You are comfortable deleting the cloud resources afterward, because this test creates registries, clusters, workloads, and release artifacts.
- When you are done validating, you will run [Complete teardown (AWS and GCP)](#complete-teardown-aws-and-gcp) (or an equivalent) so billable resources are removed.

### 0.1 Local Tools and Naming

Before touching any cloud console, install and verify these tools locally:

- `git`
- `gh`
- `aws`
- `gcloud`
- `kubectl`
- `k9s` (optional; terminal UI for the same clusters — see **§0.7**)
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
# optional: k9s --help   # after install (e.g. brew install k9s)
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

Create the following **9 environments** in **Settings → Environments → New environment**.

For a personal repo, it is fine to set yourself as the required reviewer on production environments.
Dev and sandbox environments need no reviewer — they deploy automatically or on-demand.

| Environment name      | Required reviewer | Purpose |
|-----------------------|-------------------|---------|
| `dev-tenant-1`        | none              | auto-deploys on every push to `main` |
| `dev-tenant-2`        | none              | auto-deploys on every push to `main` |
| `dev-tenant-3`        | none              | auto-deploys on every push to `main` |
| `sandbox-tenant-1`    | none              | manual promotion from dev |
| `sandbox-tenant-2`    | none              | manual promotion from dev |
| `sandbox-tenant-3`    | none              | manual promotion from dev |
| `production-tenant-1` | **yourself**      | gated release deploys |
| `production-tenant-2` | **yourself**      | gated release deploys |
| `production-tenant-3` | **yourself**      | gated release deploys |

> **Why 9 environments?** Every deploy job (including dev) now declares `environment: <tier>-<tenant>`.
> This gives per-environment secret scoping — cluster names live as environment secrets rather than
> repo secrets — plus deployment tracking on the repo homepage and the approval gate on production.

**Deployment branches and tags** — configure for each environment after creating it:

1. Open **Settings → Environments**, click the environment name.
2. Under **Deployment branches and tags**, set the dropdown to **Selected branches and tags**.
3. Add rules based on the tier:

| Tier | Branch rule | Tag rule | Reason |
|------|-------------|----------|--------|
| `dev-tenant-*` | `main` | *(none needed)* | Dev deploys only from `main` on push |
| `sandbox-tenant-*` | `main` | `v*` | Sandbox is promoted manually from `main` or an RC tag |
| `production-tenant-*` | `main` | `v*` | Production deploys from release tags |

4. Repeat for all 9 environments.

If you later run manual deploys from other long-lived branches or additional tag patterns, add matching rules here; otherwise deployments from disallowed refs will be blocked at the environment gate.

### 0.4 GitHub Secrets

Secrets are split into two scopes:

- **Repository secrets** — shared across all tenants and environments (cloud auth, registries, tokens).
  Add at **Settings → Secrets and variables → Actions → Repository secrets → New repository secret**.
- **Environment secrets** — scoped to a specific `<tier>-<tenant>` environment (cluster names).
  Add at **Settings → Environments → [environment name] → Add secret**.

---

#### Repository secrets

```text
# DHI (Docker Hardened Images) registry
DHI_REGISTRY_TOKEN=<your-dhi-token>

# tenant-1 (AWS us-east-1)
GH_ACTIONS_ROLE_ARN_TENANT_1=arn:aws:iam::<ACCOUNT_ID>:role/github-actions-role
ECR_REGISTRY_TENANT_1=<account_id>.dkr.ecr.us-east-1.amazonaws.com
AWS_REGION_TENANT_1=us-east-1

# tenant-2 (GCP us-central1)
GCP_WORKLOAD_IDENTITY_PROVIDER_TENANT_2=projects/<PROJECT_NUMBER>/locations/global/workloadIdentityPools/<POOL>/providers/<PROVIDER>
GCP_SERVICE_ACCOUNT_EMAIL_TENANT_2=github-actions@<PROJECT_ID>.iam.gserviceaccount.com
GAR_REGISTRY_TENANT_2=us-central1-docker.pkg.dev/<PROJECT_ID>/trunk
GKE_REGION_TENANT_2=us-central1

# tenant-3 (GCP europe-west1)
GCP_WORKLOAD_IDENTITY_PROVIDER_TENANT_3=projects/<PROJECT_NUMBER>/locations/global/workloadIdentityPools/<POOL>/providers/<PROVIDER>
GCP_SERVICE_ACCOUNT_EMAIL_TENANT_3=github-actions@<PROJECT_ID>.iam.gserviceaccount.com
GAR_REGISTRY_TENANT_3=europe-west1-docker.pkg.dev/<PROJECT_ID>/trunk
GKE_REGION_TENANT_3=europe-west1

# Optional: SonarCloud
SONAR_TOKEN=<sonar-token>
```

These secrets are accessed by `build-and-push` and other jobs that run without an environment context, so they must live at repo scope.

---

#### Environment secrets

Each cluster-name secret belongs only to its specific `<tier>-<tenant>` environment. This follows the principle of least privilege: a compromised dev job cannot read production cluster names.

| Environment | Secret name | Example value |
|-------------|-------------|---------------|
| `dev-tenant-1` | `EKS_CLUSTER_NAME_DEV_TENANT_1` | `trunk-dev` |
| `sandbox-tenant-1` | `EKS_CLUSTER_NAME_SANDBOX_TENANT_1` | `trunk-sandbox` |
| `production-tenant-1` | `EKS_CLUSTER_NAME_PROD_TENANT_1` | `trunk-prod` |
| `dev-tenant-2` | `GKE_CLUSTER_NAME_DEV_TENANT_2` | `trunk-dev` |
| `sandbox-tenant-2` | `GKE_CLUSTER_NAME_SANDBOX_TENANT_2` | `trunk-sandbox` |
| `production-tenant-2` | `GKE_CLUSTER_NAME_PROD_TENANT_2` | `trunk-prod` |
| `dev-tenant-3` | `GKE_CLUSTER_NAME_DEV_TENANT_3` | `trunk-dev` |
| `sandbox-tenant-3` | `GKE_CLUSTER_NAME_SANDBOX_TENANT_3` | `trunk-sandbox` |
| `production-tenant-3` | `GKE_CLUSTER_NAME_PROD_TENANT_3` | `trunk-prod` |

To add each one: **Settings → Environments → [environment name] → Add secret**, enter the secret name and value, click **Add secret**.

---

**How to obtain each value**

1. `DHI_REGISTRY_TOKEN`: Obtain from your [Docker Hardened Images](https://dhi.io) account — the token they issue for registry login.
2. **Tenant-1 (AWS)** — fill after completing **§0.5** (OIDC role, ECR, EKS):
   - `GH_ACTIONS_ROLE_ARN_TENANT_1`: **IAM → Roles → `github-actions-role` → ARN**, or:
     `aws iam get-role --role-name github-actions-role --query 'Role.Arn' --output text`
   - `ECR_REGISTRY_TENANT_1`: `<AWS_ACCOUNT_ID>.dkr.ecr.<region>.amazonaws.com` (no path).
     Account ID: `aws sts get-caller-identity --query Account --output text`
   - `AWS_REGION_TENANT_1`: Region of your ECR and EKS (e.g. `us-east-1`).
   - Cluster name secrets (`EKS_CLUSTER_NAME_*_TENANT_1`): Exact names from `aws eks list-clusters --region <region>`. Defaults: `trunk-dev`, `trunk-sandbox`, `trunk-prod`.
3. **Tenant-2 (GCP)** — fill after completing **§0.6** (service account, WIF pool, Artifact Registry, GKE):
   - `GCP_WORKLOAD_IDENTITY_PROVIDER_TENANT_2`: Full provider resource name — `projects/<PROJECT_NUMBER>/locations/global/workloadIdentityPools/<POOL>/providers/<PROVIDER>`. Get it from **IAM → Workload Identity Federation**.
   - `GCP_SERVICE_ACCOUNT_EMAIL_TENANT_2`: SA email, e.g. `github-actions@<PROJECT_ID>.iam.gserviceaccount.com`.
   - `GAR_REGISTRY_TENANT_2`: `<region>-docker.pkg.dev/<PROJECT_ID>/trunk` (no image name or tag).
   - `GKE_REGION_TENANT_2`: Region or zone of your GKE clusters (e.g. `us-central1` or `us-central1-a`).
   - Cluster name secrets (`GKE_CLUSTER_NAME_*_TENANT_2`): from `gcloud container clusters list`.
4. **Tenant-3 (GCP)** — same as tenant-2, using the tenant-3 project and `_TENANT_3` secret names. Default region: `europe-west1` (or `europe-west1-b` for zonal clusters).
5. `SONAR_TOKEN` (optional): **SonarCloud → My Account → Security → Generate Token**. If absent, CI skips analysis.

### 0.5 AWS Setup From Zero (tenant-1)

If you have not even created the AWS account yet, do these steps in order.

1. Create the AWS account you want to use for `tenant-1`.
2. Add a payment method and complete any identity/billing verification AWS requests.
3. Enable MFA on the root user immediately.
4. Create a normal IAM admin user or use AWS IAM Identity Center for daily work. Do not use the root user for CLI automation.
5. Install and configure the AWS CLI for that daily-use identity.
  **If this is your only AWS account** (or you want the new account to be the default), run:
   That writes the **default** profile in `~/.aws/credentials` and `~/.aws/config`.
   **If you already use another AWS account** on this machine, keep that account as default and add a **separate named profile** for tenant-1 so you do not overwrite existing keys:
   That creates a profile (here named `trunk-tenant-1` — choose any label you like) alongside your default profile.
   **Switching which account the CLI uses (“toggle”)**
  - **One shell session** — set the profile for that terminal only:
    ```bash
    export AWS_PROFILE=trunk-tenant-1
    aws sts get-caller-identity   # should show tenant-1’s account ID
    ```
    Unset with `unset AWS_PROFILE` to fall back to the default profile again.
  - **Per command** — leave `AWS_PROFILE` unset and pass the profile explicitly:
    ```bash
    aws sts get-caller-identity --profile trunk-tenant-1
    eksctl create cluster --name trunk-dev --region us-east-1 --profile trunk-tenant-1
    ```
   For **all later steps in §0.5** (and any local `aws` / `eksctl` commands for tenant-1), run them with that profile active (`export AWS_PROFILE=...`) or add `--profile` where the tool supports it.
   **If you use IAM Identity Center (SSO)** instead of long-lived access keys, create the profile with `aws configure sso` (or your org’s documented flow), then run `aws sso login --profile <name>` before using that profile; the same `AWS_PROFILE` / `--profile` switch pattern applies.
6. Create the GitHub OIDC identity provider in IAM:
  - Provider URL: `https://token.actions.githubusercontent.com`
  - Audience: `sts.amazonaws.com`
7. Create the `github-actions-role` IAM role with trust limited to your repository. In **IAM → Roles → Create role**, choose **Custom trust policy** (recommended) so you can paste the JSON below exactly, or choose **Web identity**, pick the OIDC provider you created in step 6 (`token.actions.githubusercontent.com`), set audience `sts.amazonaws.com`, then **edit the trust policy** to add the `sub` condition — do **not** use **AWS service**; that is for roles assumed by EC2, Lambda, etc., not GitHub OIDC. For a first pass in a personal account, trusting the exact repo is usually the least painful safe option:
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
   Replace `**GITHUB_OWNER**` and `**GITHUB_REPO**` with the path segments from your repo URL (`https://github.com/OWNER/REPO`). Example: for `https://github.com/acme-corp/platform`, use `repo:acme-corp/platform:*`.
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

    Three clusters are needed — one per environment — sized to satisfy the
    topology-spread and PDB checks in later phases:

    | Cluster         | Nodes | Instance   |
    |-----------------|-------|------------|
    | `trunk-dev`     | 1     | `t3.micro` |
    | `trunk-sandbox` | 2     | `t3.micro` |
    | `trunk-prod`    | 3     | `t3.micro` |

    > **`t3.micro` (1 GiB RAM)** is the smallest general-purpose burstable type
    > and is often covered by the [EC2 Free Tier](https://aws.amazon.com/free/)
    > for the first 12 months on new accounts.
    > EKS control planes and NAT gateways are **not** Free Tier.
    > Upgrade to `t3.small` / `t3.medium` if pods OOM or stay Pending.

    **a. Install `eksctl` (if not already present)**

    ```bash
    # macOS
    brew install eksctl

    # Linux
    curl -sLO "https://github.com/eksctl-io/eksctl/releases/latest/download/eksctl_linux_amd64.tar.gz"
    tar -xzf eksctl_linux_amd64.tar.gz && sudo mv eksctl /usr/local/bin/

    eksctl version    # confirm the binary works
    ```

    **b. Confirm you are in the right account**

    ```bash
    aws sts get-caller-identity
    # With a named profile from step 5:
    # aws sts get-caller-identity --profile trunk-tenant-1
    ```

    **c. Create the clusters — one at a time**

    Each command provisions a new VPC, subnets, NAT gateways, EKS control plane,
    and a managed node group. **Expect 15–30+ minutes per cluster** (over an hour
    total for all three).

   ```bash
    # If you configured a named profile in step 5, activate it first:
    # export AWS_PROFILE=trunk-tenant-1
    # — or append --profile trunk-tenant-1 to every command below.

    eksctl create cluster --name trunk-dev     --region us-east-1 --nodes 1 --node-type t3.micro
    eksctl create cluster --name trunk-sandbox --region us-east-1 --nodes 2 --node-type t3.micro
    eksctl create cluster --name trunk-prod    --region us-east-1 --nodes 3 --node-type t3.micro
   ```

    > Use exactly these cluster names — they match the GitHub secrets `EKS_CLUSTER_NAME_*`.
    > To pin a Kubernetes version add `--version 1.31` (or another
    > [EKS-supported version](https://docs.aws.amazon.com/eks/latest/userguide/kubernetes-versions.html));
    > omit it to let eksctl choose a region default.

    **d. Verify each cluster with `kubectl`**

    `eksctl` writes a context to `~/.kube/config` automatically. After each
    cluster finishes:

    ```bash
    kubectl config get-contexts                # new context should appear
    kubectl config use-context <context-name>  # switch to that cluster
    kubectl get nodes                          # all nodes should show Ready
    ```

    If contexts are missing or stale, regenerate them:

    ```bash
    for cluster in trunk-dev trunk-sandbox trunk-prod; do
      aws eks update-kubeconfig --region us-east-1 --name "$cluster"
    done
    ```

    **e. Set up and verify with k9s**

    Install k9s if not already present:

    ```bash
    # macOS
    brew install k9s

    # Linux
    curl -sLO "https://github.com/derailed/k9s/releases/latest/download/k9s_linux_amd64.tar.gz"
    tar -xzf k9s_linux_amd64.tar.gz && sudo mv k9s /usr/local/bin/

    k9s version    # confirm the binary works
    ```

    Open k9s — it uses the current kubectl context:

    ```bash
    k9s
    ```

    | Action         | k9s keys |
    |----------------|----------|
    | Switch cluster | `:` → type `ctx` → select `trunk-dev`, `trunk-sandbox`, or `trunk-prod` |
    | View nodes     | `:` → type `no` — all nodes should show **Ready** |
    | Exit           | `ctrl-c` or `q` |

    **f. Cost note**

    Even with Free Tier EC2 nodes, you pay for the **EKS control plane**
    (~$0.10/hr per cluster) and **NAT gateways** (~$0.045/hr each) until
    clusters are deleted. See
    [Complete teardown (AWS and GCP)](#complete-teardown-aws-and-gcp).

    **g. Troubleshooting**

    | Problem | Fix |
    |---------|-----|
    | **Service quota exceeded** (VPCs, EIPs, NAT gateways) | Request an increase in [AWS Service Quotas](https://console.aws.amazon.com/servicequotas), or delete an existing test cluster first. |
    | **Unauthorized / access denied** | The IAM identity needs `AdministratorAccess` (or explicit EKS/EC2/VPC/IAM permissions) for the initial setup. |
    | **Context not found after creation** | Run `aws eks update-kubeconfig --region us-east-1 --name <cluster>` (step d above). |

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

   You can do this in the [GCP Console](https://console.cloud.google.com/projectcreate), or via CLI:

   ```bash
   # Choose a unique project ID (lowercase letters, digits, hyphens; 6–30 chars)
   # Example: deepak-trunk-t2 for tenant-2, deepak-trunk-t3 for tenant-3
   gcloud projects create "${PROJECT_ID}" --name="trunk-tenant-2"

   # Link a billing account (required before you can enable any API)
   gcloud billing accounts list               # find your BILLING_ACCOUNT_ID
   gcloud billing projects link "${PROJECT_ID}" --billing-account=<BILLING_ACCOUNT_ID>
   ```

   > `"${PROJECT_ID}"` is the short unique slug you choose (e.g. `deepak-trunk-t2`).
   > It is **not** the same as the label "tenant-2" used in this document.
   > Run `gcloud projects list` at any time to see all your project IDs.

4. Install the Cloud SDK and log in:
  ```bash
   gcloud auth login
   gcloud auth application-default login
  ```
5. **If you need to work with two separate GCP accounts** (e.g. different Google logins for
   tenant-2 and tenant-3), use `gcloud` **named configurations** — the GCP equivalent of AWS
   named profiles.

   ```bash
   # ── Create one configuration per tenant ──────────────────────────────────
   gcloud config configurations create tenant-2
   gcloud auth login                          # logs the active config into your tenant-2 Google account
   gcloud config set project <PROJECT_ID_T2>
   gcloud config set compute/region us-central1

   gcloud config configurations create tenant-3
   gcloud auth login                          # logs the active config into your tenant-3 Google account
   gcloud config set project <PROJECT_ID_T3>
   gcloud config set compute/region europe-west1

   # ── List and inspect ──────────────────────────────────────────────────────
   gcloud config configurations list          # shows all configs; IS_ACTIVE column
   gcloud config list                         # shows active config's values
   ```

   Switch between tenants in either of these two ways:

   ```bash
   # Option A — activate globally for the current shell session
   gcloud config configurations activate tenant-2
   # all subsequent gcloud commands use tenant-2's account + project

   # Option B — one-off override per command (no global switch)
   gcloud --configuration=tenant-3 iam service-accounts list
   ```

   > For GitHub Actions and Workload Identity Federation, the `--configuration` flag
   > is only needed locally when you run setup commands. The workflow itself uses
   > OIDC tokens and never reads your local `gcloud` config.

6. Set the active project (if you are **not** using named configurations from step 5):
  ```bash
   gcloud config set project "${PROJECT_ID}"
  ```
7. Enable the required APIs:
  ```bash
   gcloud services enable \
     artifactregistry.googleapis.com \
     container.googleapis.com \
     iam.googleapis.com \
     iamcredentials.googleapis.com \
     cloudresourcemanager.googleapis.com \
     compute.googleapis.com
  ```
8. Create the GitHub Actions service account:
  ```bash
   gcloud iam service-accounts create github-actions --display-name="GitHub Actions"
  ```
9. Grant the service account the minimum practical project roles for this dummy repo's workflows:
  ```bash
   PROJECT_ID=<actual-project-id>
   SA="github-actions@"${PROJECT_ID}".iam.gserviceaccount.com"

   gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
     --member="serviceAccount:${SA}" \
     --role="roles/artifactregistry.writer"

   gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
     --member="serviceAccount:${SA}" \
     --role="roles/container.admin"
  ```
   `roles/container.admin` is intentionally broad for a first personal setup. Tighten it later if you want stricter least privilege.
10. Create the Workload Identity pool and provider for GitHub Actions:
  ```bash
   PROJECT_NUMBER="$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')"
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
     --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
     --attribute-condition="assertion.repository == '<GITHUB_OWNER>/<GITHUB_REPO>'"
  ```

  > Replace `<GITHUB_OWNER>/<GITHUB_REPO>` with your actual repo path (e.g. `deepakbansal/trunk-based-dev`).
  > The condition restricts this identity pool to tokens issued by that specific repo only —
  > without it GCP rejects the provider creation.
11. Allow your exact GitHub repo to impersonate that service account:
  ```bash
    gcloud iam service-accounts add-iam-policy-binding "${SA}" \
      --role="roles/iam.workloadIdentityUser" \
      --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/attribute.repository/<GITHUB_OWNER>/<GITHUB_REPO>"
  ```
12. Create the Artifact Registry Docker repository named `trunk` in the tenant's region:
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
13. Create the three GKE clusters per tenant.

    Three clusters are needed per tenant — one per environment — to satisfy the topology-spread
    and PDB checks in later phases:

    | Cluster         | Tenant   | Nodes | Zone / Region       |
    |-----------------|----------|-------|---------------------|
    | `trunk-dev`     | tenant-2 | 1     | `us-central1-a`     |
    | `trunk-sandbox` | tenant-2 | 2     | `us-central1-a`     |
    | `trunk-prod`    | tenant-2 | 3     | `us-central1-a`     |
    | `trunk-dev`     | tenant-3 | 1     | `europe-west1-b`    |
    | `trunk-sandbox` | tenant-3 | 2     | `europe-west1-b`    |
    | `trunk-prod`    | tenant-3 | 3     | `europe-west1-b`    |

    **a. Install the GKE auth plugin (required for `kubectl` to work with GKE)**

    ```bash
    gcloud components install gke-gcloud-auth-plugin

    # Add to your shell profile so kubectl picks it up:
    echo 'export USE_GKE_GCLOUD_AUTH_PLUGIN=True' >> ~/.zshrc
    source ~/.zshrc
    ```

    > On Linux (Debian/Ubuntu): `sudo apt-get install google-cloud-cli-gke-gcloud-auth-plugin`

    **b. Create Standard zonal clusters (recommended for personal quota)**

    Use **zonal** clusters (`--zone` = single zone) with `e2-micro` nodes.
    Avoid `--region` (regional = 3 zones × node count = 3× the vCPU quota usage).

    > **CPU quota note:** GKE Autopilot reserves ~8 vCPUs per cluster — it will exceed the default
    > project quota of 12 vCPUs if you create more than one cluster. Use Standard zonal instead.
    > `e2-micro` has 2 vCPUs, so 6 nodes total = 12 vCPUs, exactly fitting the default quota.

    ```bash
    # ── tenant-2 (us-central1-a) ─────────────────────────────────────────────
    gcloud config configurations activate tenant-2

    gcloud container clusters create trunk-dev     --zone=us-central1-a --machine-type=e2-small --num-nodes=1 --disk-size=32
    gcloud container clusters create trunk-sandbox --zone=us-central1-a --machine-type=e2-small --num-nodes=1 --disk-size=32
    gcloud container clusters create trunk-prod    --zone=us-central1-a --machine-type=e2-small --num-nodes=1 --disk-size=32

    # ── tenant-3 (europe-west1-b) ─────────────────────────────────────────────
    gcloud config configurations activate tenant-3

    gcloud container clusters create trunk-dev     --zone=europe-west1-b --machine-type=e2-small --num-nodes=1 --disk-size=32
    gcloud container clusters create trunk-sandbox --zone=europe-west1-b --machine-type=e2-small --num-nodes=1 --disk-size=32
    gcloud container clusters create trunk-prod    --zone=europe-west1-b --machine-type=e2-small --num-nodes=1 --disk-size=32
    ```

    > **Quota notes:**
    > - `--disk-size=32` reduces the boot disk from the 100 GB default to 32 GB (minimum safe size).
    >   Without it, 3 nodes × 100 GB = 300 GB which exceeds the default `SSD_TOTAL_GB` quota of 250 GB.
    > - `--num-nodes=1` keeps all 6 nodes within the default CPU quota (12 vCPUs: 6 nodes × 2 vCPUs).
    > - **Use `e2-small` (2 GiB RAM), not `e2-micro` (1 GiB).** `e2-micro` is too small for GKE's
    >   system pods — the konnectivity agent stays Pending, breaking `kubectl exec/logs/port-forward`.
    > - `e2-small` costs ~$0.014/hr per node. To increase any quota:
    >   [IAM → Quotas](https://console.cloud.google.com/iam-admin/quotas).

    **c. Update kubeconfig for all clusters**

    After creation, fetch credentials so `kubectl` and k9s can reach them:

    ```bash
    # tenant-2
    gcloud config configurations activate tenant-2
    for cluster in trunk-dev trunk-sandbox trunk-prod; do
      gcloud container clusters get-credentials "${cluster}" --zone=us-central1-a
    done

    # tenant-3
    gcloud config configurations activate tenant-3
    for cluster in trunk-dev trunk-sandbox trunk-prod; do
      gcloud container clusters get-credentials "${cluster}" --zone=europe-west1-b
    done

    kubectl config get-contexts   # all six GKE contexts should now appear
    ```

    **d. Verify with k9s**

    ```bash
    k9s
    ```

    | Action         | k9s keys |
    |----------------|----------|
    | Switch cluster | `:` → type `ctx` → select any `trunk-dev/sandbox/prod` GKE context |
    | View nodes     | `:` → type `no` — nodes should show **Ready** |
    | Exit           | `ctrl-c` or `q` |
14. Verify the tenant project before continuing:
  ```bash
    gcloud artifacts repositories list
    gcloud container clusters list
  ```

### 0.7 Kubernetes Bootstrap Objects

Before the first real deploy, each cluster needs three things that the deploy workflow itself never
creates: a **namespace**, a **ConfigMap**, a **ServiceAccount**, and optionally **DB/Redis secrets**.

> **Namespace, ConfigMap, and ServiceAccount** are now part of the Kustomize overlays
> (`k8s/base/rbac/serviceaccount.yaml` is referenced by every overlay). The deploy workflow creates
> them automatically on the first `kubectl apply -k`. However, running the dedicated **Bootstrap
> workflow** first is strongly recommended — it pre-creates all objects AND the secrets in a single
> step, so the very first deploy finds a clean cluster rather than racing to create them.

#### K9s quick reference (same steps as `kubectl` below)

[k9s](https://github.com/derailed/k9s) is a terminal UI over your kubeconfig. Install (e.g. `brew install k9s` on macOS, or a [release binary](https://github.com/derailed/k9s/releases)). Run `k9s`; it uses the **current context** (`kubectl config current-context`).

| Intent                 | In k9s                                                                        |
| ---------------------- | ----------------------------------------------------------------------------- |
| Pick cluster           | `:` → `ctx` → choose context (repeat when switching EKS/GKE clusters)        |
| Limit to one namespace | `:` → `ns` → type e.g. `trunk-dev-tenant-1`                                  |
| All namespaces         | `:` → `ns` → pick `all` or `0`                                                |
| Pods                   | `:` → `pod` (or `po`)                                                         |
| Deployments            | `:` → `deploy`                                                                |
| Jobs (e.g. migrations) | `:` → `job`                                                                   |
| ConfigMaps             | `:` → `cm`                                                                    |
| Secrets                | `:` → `secret` (or `sec`)                                                     |
| ServiceAccounts        | `:` → `sa`                                                                    |
| Nodes                  | `:` → `no`                                                                    |
| Describe resource      | Select row → `d`                                                              |
| Logs                   | Select pod → `l` → pick container (including init containers)                 |
| YAML                   | Select row → `y`                                                              |
| Delete resource        | Select row → `ctrl-d` (confirm) — use carefully                               |
| Port forward           | Select pod or deployment → `shift-f` → enter local/remote port mapping        |
| Help                   | `?` (per view); `esc` to go back                                              |

**What k9s does not replace:** `kubectl apply -f …`, `kubectl create secret … --from-literal`, and
`kubectl auth can-i` are still easiest from the shell. Use k9s to **verify** and **inspect**.

---

#### Recommended: use the Bootstrap workflow (GitHub Actions)

Trigger `.github/workflows/bootstrap.yml` via **Actions → Bootstrap Clusters → Run workflow**:

| Input | What to enter |
|-------|--------------|
| `tenant` | `all` (or a specific tenant to bootstrap just one) |
| `environment` | `all` (or `dev` / `sandbox` / `production`) |

The workflow is **idempotent** — re-running it is safe.

> **DB/Redis URLs are not inputs to the workflow.** Workflow inputs are stored as plain text
> in GitHub's run history and visible to anyone with repo read access. The bootstrap creates
> **empty placeholder** secrets so pods can start (init containers skip checks when the value
> is blank). Set real connection strings locally via `kubectl` after bootstrap runs:
>
> ```bash
> kubectl create secret generic trunk-db-secret \
>   --from-literal=DATABASE_URL='postgres://user:pass@host:5432/db' \
>   -n <namespace> --dry-run=client -o yaml | kubectl apply -f -
>
> kubectl create secret generic trunk-redis-secret \
>   --from-literal=REDIS_URL='redis://host:6379' \
>   -n <namespace> --dry-run=client -o yaml | kubectl apply -f -
> ```

It creates on every targeted cluster:
- The namespace (e.g. `trunk-dev-tenant-1`)
- The `trunk-config` ConfigMap
- The `trunk-service-account` ServiceAccount
- The `trunk-db-secret` and `trunk-redis-secret` Secrets

After it completes, verify with k9s on each cluster:

```
: → ctx   (pick the cluster)
: → ns    (confirm trunk-<env>-<tenant> namespaces exist)
: → sa    (confirm trunk-service-account in each namespace)
: → cm    (confirm trunk-config; describe with d to check TENANT/CLOUD/REGION keys)
: → secret (confirm trunk-db-secret and trunk-redis-secret exist)
```

---

#### Alternative: manual bootstrap (local kubectl)

If you prefer running commands locally instead of via GitHub Actions:

```bash
# Repeat for each cluster — switch context first:
# kubectl config use-context <context-name>

NS="trunk-dev-tenant-1"    # change for each namespace

kubectl apply -f k8s/overlays/tenant-1/dev/namespace.yaml
kubectl apply -f k8s/overlays/tenant-1/dev/configmap.yaml --namespace="${NS}"
kubectl apply -f k8s/base/rbac/serviceaccount.yaml        --namespace="${NS}"

kubectl create secret generic trunk-db-secret   --from-literal=DATABASE_URL='postgres://user:password@<db-host>:5432/<db-name>'   --namespace="${NS}" --dry-run=client -o yaml | kubectl apply -f -

kubectl create secret generic trunk-redis-secret   --from-literal=REDIS_URL='redis://<redis-host>:6379'   --namespace="${NS}" --dry-run=client -o yaml | kubectl apply -f -
```

> If you do not yet have real Postgres/Redis services, leave the URL values empty (`--from-literal=DATABASE_URL=''`).
> The init containers skip their connectivity check when the value is blank, so pods still start.

Verify your local admin access before triggering GitHub Actions:

```bash
kubectl auth can-i '*' '*' --all-namespaces   # should return yes
kubectl get ns                                 # all nine trunk-* namespaces should appear
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
  - If `migrations/`** changed, the workflow also recreates and waits on `job/trunk-api-migrate` in each target namespace.
  - Concurrency note: push-triggered runs use group `deploy-dev-all` and serialize. Manual `workflow_dispatch` runs with a specific tenant use group `deploy-dev-<tenant>` and do not block other tenants.
   **(k9s)** To watch migrations: `**ctx`** → cluster, `**ns**` → dev namespace, `**:**` → `**job**`, select `**trunk-api-migrate**`, `**l**` for logs, `**d**` for describe (backoff / failures).
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
   **(k9s)** `**:`** → `**ctx**` → tenant-1 cluster, `**:**` → `**ns**` → `trunk-dev-tenant-1`, `**:**` → `**pod**`. Repeat for `trunk-dev-tenant-2` / `trunk-dev-tenant-3` (switch `**ctx**` to each tenant’s cluster). All app pods should be **Running** / Ready.
6. The workflow auto-smoke-tests `trunk-api` with 5 fixed 5-second retries. In dev this is
  intentionally non-fatal, matching TOFA's current behavior. Verify the other services manually by
   port-forwarding each deployment separately:
   **(k9s)** `**:`** → `**ns**` → `trunk-dev-tenant-1`, `**:**` → `**deploy**`, highlight e.g. `**trunk-api**`, `**shift-f**`, set local port **4000** → container port **4000** (or as in your manifest), then `curl` as above. Repeat for `**trunk-orders`**, `**trunk-notifications**`, `**trunk-payments**`. Stop forwards from k9s when done (follow the UI prompt or exit the forward view).
  > Unlike TOFA's single-service management deployment, this dummy repo has one deployment per
  > service. Each health check should be exercised against its own deployment.
7. **Verify startup probe sequencing (optional)**: Confirm that Kubernetes uses the startup probe window before handing off to liveness/readiness.
  1. Watch events on a freshly deployed pod:
    ```bash
     kubectl describe pod -n trunk-dev-tenant-1 -l app=trunk-api | grep -A5 Events
    ```
     **(k9s)** `**:`** → `**ns**` → `trunk-dev-tenant-1`, `**:**` → `**pod**`, select a `**trunk-api**` pod, `**d**` (describe), scroll to **Events** (same information as `kubectl describe`).
  2. Expect: no liveness or readiness failures during boot. The startup probe fires every 5s; only after it passes once do readiness and liveness begin.
  3. To observe the full window deliberately: temporarily make `/health` return a non-200 for the first 30s of startup (e.g., via a feature flag), then watch `kubectl get pod -w`. The pod should stay in `Running` (not `CrashLoopBackOff`) for up to 5 minutes before failing — confirming the 60-attempt budget is respected.
    **(k9s)** Stay in `**pod`** view with `**:**` → `**ns**` → `trunk-dev-tenant-1`; enable **watch** if your k9s version shows a `**w`** toggle in the header, or refresh manually. Confirm status stays **Running** during the startup window.
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
     **(k9s)** `**pod`** view, filter/select `**trunk-api**` pods, `**ctrl-d**`, confirm delete.
  3. Watch the init container logs:
    ```bash
     kubectl logs -n trunk-dev-tenant-1 -l app=trunk-api -c database-check -f
    ```
     **(k9s)** Select the new `**trunk-api`** pod, `**l**`, choose init container `**database-check**` (stream logs; `**f**` may toggle follow depending on version).
9. Expect fixed retry lines from `wait-for-tcp.sh`, then a bounded timeout.
  ```
      Database not ready at <host>:5432 — retry N, elapsed <x>s/120s
      Timed out waiting for Database after 120s — check DATABASE_URL and network
      ```
  ```
  1. Confirm the pod never becomes `Running`/`1/1 Ready`, and use `kubectl describe pod` if the
    short `STATUS` column does not show `CrashLoopBackOff`.
     **(k9s)** In `**pod`** view read **STATUS** / **READY**; `**d`** on the pod for full events and init container state.
  2. Restore the secret with the correct `DATABASE_URL` and delete the pod again to recover.

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
   **(k9s)** Same pattern as Phase 4 step 5: `**ctx`** per tenant cluster, `**ns**` → `trunk-sandbox-tenant-{1,2,3}`, `**pod**` — all workloads **Running**.
6. The workflow auto-smoke-tests `trunk-api` with 5 fixed 5-second retries and fails on exhaustion.
  Verify the other services manually with the same port-forward pattern used in Phase 4.
   **(k9s)** Same as Phase 4 port-forward: `**deploy`** + `**shift-f**` per service in `trunk-sandbox-tenant-1` (and other tenants if you test there).
7. **Test rollout failure detection**: The `kubectl rollout status` step in sandbox is **strict** (no `|| true`). A stalled rollout will fail the job. To verify this protection works, temporarily set an invalid image tag, trigger a deploy, and confirm the job fails at rollout wait rather than proceeding to smoke test.
  **(k9s)** During/after the bad deploy, `**:`** → `**pod**` in the sandbox namespace — expect **ImagePullBackOff** / **ErrImagePull** or non-ready pods; `**d`** on a failing pod for events. `**:**` → `**deploy**` shows rollout state at a glance.
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
2. The `production-`* environments will pause for **required reviewer approval** — approve each.
3. Build-and-push creates images tagged: `<sha>`, `v0.1.1`, `latest`
4. Trivy runs with `CRITICAL,HIGH` — must be clean to proceed.
5. Each tenant's deploy applies the production overlay (3 replicas, PDB `minAvailable: 2`, topology spread constraints).
6. **Verify topology spread (optional)**: Confirm pods landed on separate nodes:
  ```bash
   kubectl get pods -n trunk-production-tenant-1 -o wide
   # NODE column should show 3 distinct node names across all 4 services
  ```
   **(k9s)** `**:`** → `**ns**` → `trunk-production-tenant-1`, `**:**` → `**pod**`. Ensure the table shows a **NODE** column (toggle wide columns via your k9s footer/`?` if needed). No two pods of the same deployment should share the same **NODE** for a 3-replica spread.
   To verify AZ spread (if the cluster spans multiple zones):
   **(k9s)** For each **NODE** name from the pod list, `**:`** → `**no**`, select that node, `**d**` — read `**topology.kubernetes.io/zone**` in labels. The `jq` loop above is optional if you prefer the shell.
   **What to expect**: Each service's 3 pods should be on 3 different nodes (hard constraint). AZ distribution is best-effort — pods prefer different zones but will co-locate in the same zone if the cluster doesn't span AZs.
   **If a pod stays Pending**: The hard node constraint (`DoNotSchedule`) could not be satisfied — likely fewer than 3 schedulable nodes are available. Check `kubectl describe pod` for `FailedScheduling` events and verify the cluster has ≥3 nodes via `kubectl get nodes`.
   **(k9s)** `**d`** on a **Pending** pod → **Events** → **FailedScheduling**; `**no`** view → confirm at least three **Ready** nodes.
7. `kubectl rollout status` is **strict** in production — a stalled rollout fails the job immediately.
  **(k9s)** Watch `**deploy`** and `**pod**` in the production namespace during deploy; stuck **ReplicaSet** / not-ready pods mirror what `rollout status` enforces in CI.
8. The workflow smoke-tests `trunk-api` with 5 fixed 5-second retries and fails on exhaustion.
  Manually verify the other services after deploy using port-forwarding if you want full
   multi-service confidence.
   **(k9s)** Same `**deploy`** + `**shift-f**` pattern as Phase 4 for extra service checks.
9. After all deploys succeed, `publish-release` job runs:
  - Reads the version from the `build-and-push` job output (not re-reading `package.json` at publish time, eliminating a TOCTOU window).
  - Git tag `v0.1.1` is created and pushed (idempotent — safe to re-run if already tagged).
  - GitHub Release is created with auto-generated notes.
10. Verify:
  ```bash
   git fetch --tags
   git tag --list
   # Should include: v0.1.1
  ```
11. Check **Releases** tab in GitHub.

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
   **(k9s)** `**:`** → `**ns**` → `trunk-production-tenant-1`, `**:**` → `**deploy**`, select `**trunk-api**`, `**d**` — confirm **Image** in the describe output. For revision list, prefer `**kubectl rollout history`** unless your k9s version documents a rollout shortcut in `**?**` on the deploy view.
4. Smoke test confirms `/health` still returns 200.
  **(k9s)** `**deploy`** → `**trunk-api**` → `**shift-f**` to port-forward and `curl` `/health` if you are not relying on the workflow smoke step alone.
5. **Verify isolation**: confirm `trunk-orders`, `trunk-notifications`, `trunk-payments` in tenant-1 production, and all services in tenant-2/tenant-3, are unaffected.
  **(k9s)** In `**deploy`** / `**pod**` for `trunk-production-tenant-1`, confirm other deployments unchanged; switch `**ctx**` to tenant-2/3 clusters and spot-check `**pod**` there.
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
   **(k9s)** For each tenant, `**ctx`** → that cluster, `**ns**` → `trunk-production-tenant-1` / `...-tenant-2`, `**deploy**` → `**trunk-api**`, `**d**` — compare **Image** tag (`v0.2.0` vs `v0.1.1`).
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

- CI runs on every PR: lint, typecheck, tests, changeset check, K8s validation
- E2E gate blocks merge; `/run-e2e` comment unblocks it (only MEMBER/OWNER/COLLABORATOR)
- E2E commit status badge is clickable (links to the workflow run)
- E2E cancellation sets status to `failure`, not `pending`
- dev deploy triggers automatically on push to main (all 3 tenants, changed services or all 4 when shared/root files change)
- dev images tagged with `<sha>` only (no `dev-latest`)
- dev concurrency: push-to-main serializes as `deploy-dev-all`; per-tenant dispatch runs independently
- "Version Packages" PR created automatically by release.yml (timeout: 10 min)
- `trunk-api-migrate` runs when `migrations/**` changes or `run_migrations=true`
- Sandbox deploy: images tagged `<sha>` and `v<version>-rc.<N>` (no `sandbox-latest`)
- Sandbox rollout failure fails the job (strict `kubectl rollout status`, no `|| true`)
- Production deploy: images tagged `<sha>`, `v<version>`, `latest`
- Production rollout failure fails the job
- Git tag `v<version>` and GitHub Release created after successful production deploy (idempotent on re-run)
- Rollback workflow reverts a single service in a single tenant without affecting others
- Rollback input `service` uses the bare service name (e.g. `api`) and the workflow resolves `deployment/trunk-<service>`
- Differential deploy: tenant-1 on v0.2.0 while tenant-2/3 stay on v0.1.1
- All 9 namespaces (`trunk-{dev,sandbox,production}-{tenant-1,tenant-2,tenant-3}`) created and healthy
- ConfigMap `trunk-config` in each namespace has correct `TENANT`, `CLOUD`, `REGION` values
- Production pods spread across distinct nodes — `kubectl get pods -o wide` (or k9s **Pods** view with **NODE** column) shows no two pods of the same service sharing a NODE value
- No `FailedScheduling` events in production (cluster has ≥3 schedulable nodes per tenant)
- Startup probe fires every 5s with a 60-attempt (5-minute) budget; no liveness or readiness failures observed during normal pod boot
- `trunk-api` init containers (`database-check`, `redis-check`) use shared `wait-for-tcp.sh` with fixed retry intervals and fail within the configured timeout when the dependency is unreachable

---

## Complete teardown (AWS and GCP)

Use this when you have **finished testing** and want **no further compute or networking charges** from the resources this guide created.

> **If `eksctl delete cluster` fails** (timeouts, stuck dependencies): finish deletion via **CloudFormation** or the **EKS** console, then remove any leftover **NAT gateways** and **Elastic IPs** under **VPC** — NAT gateways alone can cost **dollars per day** if left running.

**General**

1. Run deletions in the order below (dependents first). Wait until each `delete` finishes before assuming billing stopped.
2. In **AWS Billing → Cost Explorer** and **GCP Billing → Reports**, charges can appear **up to ~24 hours** after resources are gone.
3. **GitHub** repository secrets and environments have **no per-hour cloud cost**; remove them only if you want a clean GitHub-side slate.

### AWS (tenant-1, `us-east-1`)

**Goal:** remove **EKS clusters** (control plane + node groups), **VPC networking** created for them (including **NAT gateways** and **Elastic IPs**), and optionally **ECR** and **IAM** objects.

1. **Delete every EKS cluster** you created (each cluster name from this guide: `trunk-dev`, `trunk-sandbox`, `trunk-prod` — skip names you never created):
  ```bash
   export AWS_REGION=us-east-1
   # Optional: export AWS_PROFILE=trunk-tenant-1

   for cluster in trunk-prod trunk-sandbox trunk-dev; do
     eksctl delete cluster --name "$cluster" --region "$AWS_REGION" --wait
   done
  ```
   `eksctl delete cluster` removes the cluster’s **managed stacks** (nodes, control plane association, and the **VPC and NAT gateways** that `eksctl create cluster` created for that cluster). Use `--wait` so the command blocks until AWS finishes.
2. **Confirm nothing billable is left in EC2 / VPC:**
  - **Console:** **VPC → Your VPCs** — no stray `eksctl-`* or test VPCs. If a VPC remains, open **NAT Gateways**, **Elastic IPs**, **Internet Gateways**, **Subnets**, **Route tables**, and delete them in dependency order (NAT → dissociate EIP → release EIP → detach/IGW → subnets → route tables → VPC).
  - **CLI spot-check:**
    ```bash
    aws eks list-clusters --region us-east-1
    aws ec2 describe-nat-gateways --region us-east-1 --filter Name=state,Values=available,pending
    ```
3. **ECR (optional but recommended for a clean account):** repositories are **cheap when empty** but still exist until deleted. List names in the console or with `aws ecr describe-repositories --region us-east-1`, then delete only repos you created for this exercise. `**--force` removes every image** in that repository:
  ```bash
   # Example: delete one repository and all its images
   aws ecr delete-repository --repository-name trunk-api-dev-tenant-1 --region us-east-1 --force

   # If you truly want every ECR repo in the region gone (dangerous on a shared account):
   for repo in $(aws ecr describe-repositories --region us-east-1 --query 'repositories[].repositoryName' --output text); do
     aws ecr delete-repository --repository-name "$repo" --region us-east-1 --force
   done
  ```
   **Caution:** Narrow the loop to `trunk-*` / `dhi-runtime-node` names if you share the account with other work.
4. **IAM (optional, no hourly charge):** remove the **GitHub OIDC** integration if you will not use it again:
  - Delete role `**github-actions-role`** (or the name you used): **IAM → Roles**.
  - Delete **OpenID Connect provider** `token.actions.githubusercontent.com`: **IAM → Identity providers**.

### GCP (tenant-2 `us-central1`, tenant-3 `europe-west1`)

**Goal:** remove **GKE clusters** (Autopilot still bills for control plane + workload resources until clusters are deleted), **Artifact Registry** Docker repo if you want zero registry storage, and optionally **WIF + service account**.

**Tenant-2 project** (`gcloud config set project <TENANT_2_PROJECT_ID>`):

```bash
REGION=us-central1
for cluster in trunk-prod trunk-sandbox trunk-dev; do
  gcloud container clusters delete "$cluster" --region "$REGION" --quiet
done

# Artifact Registry (deletes all images in repo `trunk`)
gcloud artifacts repositories delete trunk --location="$REGION" --quiet
```

**Tenant-3 project** (`gcloud config set project <TENANT_3_PROJECT_ID>`):

```bash
REGION=europe-west1
for cluster in trunk-prod trunk-sandbox trunk-dev; do
  gcloud container clusters delete "$cluster" --region "$REGION" --quiet
done

gcloud artifacts repositories delete trunk --location="$REGION" --quiet
```

Then verify:

```bash
gcloud container clusters list --project <TENANT_2_PROJECT_ID>
gcloud container clusters list --project <TENANT_3_PROJECT_ID>
```

**Optional cleanup (little or no ongoing cost, but removes credentials surface):**

- Remove **Workload Identity** pool provider and pool (reverse of §0.6): delete **OIDC provider** in pool **github-pool**, then delete pool **github-pool**.
- Delete service account `**github-actions@...`** if unused elsewhere.
- **Shutting down or deleting entire GCP projects** stops all project resources but is irreversible beyond recovery windows — use **Cloud Console → IAM & Admin → Manage Resources** only if you intend to abandon the projects entirely.

### Teardown notes

- **What drives ongoing cost:** Hourly charges come mainly from **running billable resources** — **EKS/GKE**, **worker nodes**, **NAT gateways**, and **public IPs**. The teardown steps above focus on deleting **clusters, VPC/NAT, and registries** first. **IAM** roles, **OIDC providers**, **empty or tiny ECR/GAR** storage, and **Workload Identity** configuration are not meaningful “by the hour” costs, but you can remove them for a clean account.
- **Failed cluster delete:** If stack deletion hangs, resolve it in the AWS console and **verify no NAT gateways remain** in any test VPC before you consider teardown done.

---

## Secrets Quick Reference


| Secret name                                    | Used in                      | Purpose                                  |
| ---------------------------------------------- | ---------------------------- | ---------------------------------------- |
| `DHI_REGISTRY_TOKEN`                           | dhi-sync                     | Auth to pull from dhi.io                 |
| `GH_ACTIONS_ROLE_ARN_TENANT_1`                 | deploy-*                     | AWS OIDC role for tenant-1               |
| `ECR_REGISTRY_TENANT_1`                        | deploy-*, dhi-sync           | ECR registry URL                         |
| `AWS_REGION_TENANT_1`                          | dhi-sync                     | AWS region (default: us-east-1)          |
| `EKS_CLUSTER_NAME_{DEV,SANDBOX,PROD}_TENANT_1` | deploy-*, rollback           | EKS cluster names                        |
| `GCP_WORKLOAD_IDENTITY_PROVIDER_TENANT_2`      | deploy-*, dhi-sync, rollback | GCP WIF provider for tenant-2            |
| `GCP_SERVICE_ACCOUNT_EMAIL_TENANT_2`           | deploy-*, dhi-sync, rollback | GCP SA email for tenant-2                |
| `GAR_REGISTRY_TENANT_2`                        | deploy-*, dhi-sync           | GAR registry URL for tenant-2            |
| `GKE_CLUSTER_NAME_{DEV,SANDBOX,PROD}_TENANT_2` | deploy-*, rollback           | GKE cluster names for tenant-2           |
| `GKE_REGION_TENANT_2`                          | deploy-*, rollback           | GKE region (default: us-central1)        |
| `GCP_WORKLOAD_IDENTITY_PROVIDER_TENANT_3`      | deploy-*, dhi-sync, rollback | GCP WIF provider for tenant-3            |
| `GCP_SERVICE_ACCOUNT_EMAIL_TENANT_3`           | deploy-*, dhi-sync, rollback | GCP SA email for tenant-3                |
| `GAR_REGISTRY_TENANT_3`                        | deploy-*, dhi-sync           | GAR registry URL for tenant-3            |
| `GKE_CLUSTER_NAME_{DEV,SANDBOX,PROD}_TENANT_3` | deploy-*, rollback           | GKE cluster names for tenant-3           |
| `GKE_REGION_TENANT_3`                          | deploy-*, rollback           | GKE region (default: europe-west1)       |
| `SONAR_TOKEN`                                  | ci                           | SonarCloud SAST (optional)               |
| `GITHUB_TOKEN`                                 | all                          | Automatically provided by GitHub Actions |


