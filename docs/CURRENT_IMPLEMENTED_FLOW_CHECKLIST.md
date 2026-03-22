# Current Implemented Flow Checklist

> Purpose: a short go/no-go checklist for testing the dummy repo against the pipeline behavior that is implemented today.
>
> Use this before and during your first real GitHub + AWS/GCP end-to-end run.

---

## 1. What You Can Test Now

You can confidently test the currently implemented path:

- `CI`
- PR-level `E2E Gate` plus `/run-e2e`
- merge to `main`
- auto `Deploy to Dev`
- `Release (Version Packages)` PR
- manual `Deploy to Sandbox`
- manual `Deploy to Production`
- `Rollback`
- tenant-differential promotion

You should treat this as the production-like rehearsal path for the current pipeline.

---

## 2. Go / No-Go Before Starting

Do not start the live end-to-end run until all of these are true:

- [ ] `DHI Base Image Sync` can run successfully for all tenants.
- [ ] GitHub Actions secrets are configured for AWS, GCP, DHI, and optional SonarCloud.
- [ ] GitHub environments exist for `sandbox-*` and `production-*`.
- [ ] Required reviewers can approve sandbox/production deployments.
- [ ] ECR / GAR repositories exist with the exact names expected by the workflows.
- [ ] Target clusters are reachable through GitHub OIDC auth.
- [ ] Required namespaces, ConfigMaps, and Secrets exist in target clusters.
- [ ] You are comfortable creating and discarding real cloud artifacts during this rehearsal.

If any of the above is false, fix it before starting Phase 1.

---

## 3. What Is Enforced Today

These are part of the current implemented pipeline and should pass in your dummy-repo run:

### PR / Merge Path

- [ ] CI runs on the PR.
- [ ] CI enforces lint, typecheck, tests, coverage, changeset check, and manifest validation.
- [ ] E2E gate sets PR status to `pending`.
- [ ] `/run-e2e` runs the E2E workflow and updates the same commit status.
- [ ] PR stays blocked until `E2E Tests` is `success`.

### Dev Path

- [ ] Merge to `main` triggers `Deploy to Dev`.
- [ ] Dev images are pushed with immutable SHA tags.
- [ ] Migration job runs only when migration files changed or `run_migrations=true`.
- [ ] Dev smoke test uses fixed retries.
- [ ] Dev smoke failure is non-fatal by design.

### Release / Sandbox / Production Path

- [ ] `Release (Version Packages)` creates or updates the version PR.
- [ ] Sandbox deploy runs only via manual dispatch.
- [ ] Sandbox can require environment approval.
- [ ] Sandbox pushes `<sha>` and `v<version>-rc.<run_number>` tags.
- [ ] Sandbox Trivy scan blocks on `CRITICAL`.
- [ ] Sandbox smoke test is fatal.
- [ ] Production deploy runs only via manual dispatch.
- [ ] Production can require environment approval.
- [ ] Production pushes `<sha>`, `v<version>`, and `latest`.
- [ ] Production Trivy scan blocks on `CRITICAL,HIGH`.
- [ ] Production smoke test is fatal.
- [ ] Git tag and GitHub Release are created only after successful production deploy.

### Rollback / Tenant Independence

- [ ] Rollback can undo the previous rollout.
- [ ] Rollback can also target a specific tag.
- [ ] Rollback is scoped to one tenant + one environment + one service.
- [ ] One tenant can be promoted ahead of other tenants.

---

## 4. What Is Optional Or Environment-Dependent

These are not blockers for your first dummy-repo end-to-end run:

- [ ] SonarCloud can be enabled if `SONAR_TOKEN` is configured.
- [ ] Migration path can be force-tested with `run_migrations=true` even if no new migration exists.
- [ ] Differential tenant rollout can be tested after the first full-path run instead of during it.

---

## 5. What You Should Not Expect Yet

These are not part of the currently implemented must-pass path:

- [ ] Built-in Snyk gate in the main workflows.
- [ ] Built-in post-deploy E2E gate inside sandbox deploy workflow.
- [ ] Built-in post-deploy E2E gate inside production deploy workflow.
- [ ] Built-in DAST stage after sandbox deploy.
- [ ] Built-in DAST stage after production deploy.
- [ ] Private-EKS SSM tunnel path, unless your cluster access model specifically requires it.

If these are missing during your dummy-repo rehearsal, that is expected and does not mean the current implemented flow is broken.

---

## 6. Recommended First Run

Use this exact sequence for the first confidence run:

1. [ ] Run `DHI Base Image Sync`.
2. [ ] Open a tiny feature PR with a changeset.
3. [ ] Wait for `CI` to pass.
4. [ ] Comment `/run-e2e`.
5. [ ] Merge to `main`.
6. [ ] Wait for `Deploy to Dev` to finish.
7. [ ] Merge the `Version Packages` PR.
8. [ ] Run `Deploy to Sandbox` with broad inputs.
9. [ ] Run `Deploy to Production` with broad inputs.
10. [ ] Run `Rollback` for one tenant/service.

Recommended broad inputs:

- Sandbox: `ref=main`, `tenant=all`, `services=all`, `run_migrations=false`, `skip_validation=false`
- Production: `ref=main`, `tenant=all`, `services=all`, `run_migrations=false`
- Rollback: `tenant=tenant-1`, `environment=production`, `service=api`, `target_revision=` empty

---

## 7. Success Criteria

You can treat the dummy repo as a successful rehearsal of the current implemented flow only if all of these are true:

- [ ] DHI sync passed for all target registries.
- [ ] PR flow passed with CI plus E2E gate.
- [ ] Dev deploy passed.
- [ ] Version Packages PR flow worked.
- [ ] Sandbox deploy passed.
- [ ] Production deploy passed.
- [ ] Git tag and GitHub Release were created correctly.
- [ ] Rollback passed.
- [ ] At least one tenant-differential promotion scenario was demonstrated.

If the checklist above is green, you have validated the path that the current repo actually implements today.
