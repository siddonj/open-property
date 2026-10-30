# AI-native SDLC

This repository uses a lightweight, human-directed version of the six-stage
AI-native SDLC described in [Claude's playbook](https://claude.com/resources/articles/the-ai-native-sdlc-playbook).
The process keeps the user's intent connected to design, implementation,
verification, review, and follow-up without introducing external services or
automated release infrastructure.

## Start a change

Use the repository-local Claude Code skill by invoking `/ai-native-sdlc` with
the request or an existing intent file. For a substantial change, keep its
artifacts in `docs/sdlc/changes/<slug>/`. Start with the templates in
[`templates/`](templates/).

The root [`intent.md`](../../intent.md) is the long-term product roadmap. It is
not the intent record for an individual change.

## Stages and artifacts

1. **Plan** — Capture the problem, desired outcome, affected users and systems,
   constraints, acceptance criteria, and open questions in `intent.md`.
   Review and approve it before designing substantial work.
2. **Design** — Turn accepted intent into `spec.md`, describing behavior, user
   experience, data and API changes, risks, and unresolved decisions. Get
   approval before implementation; do not silently decide product questions.
3. **Build** — Agree on a `plan.md` that names affected files, implementation
   order, risks, and proof. Implement against it and update the plan if the
   approach changes materially.
4. **Test** — Run `pnpm typecheck` and `pnpm build`. Add and run focused tests
   when a test suite is introduced or the change provides one. For UI work,
   inspect the result in a browser when available. State exactly what ran and
   what remains unverified.
5. **Deploy** — Review the diff against the intent, spec, plan, and
   [`REVIEW.md`](../../REVIEW.md). A human remains responsible for approving
   merges and deployments. This repository does not configure automated
   production approval or release gates.
6. **Maintain** — When a defect or operational issue is identified, record its
   evidence and impact in an `incident.md` and route it through the same
   workflow. This repository has no production monitoring or autonomous
   maintenance loop configured.

Keep the process proportional: routine, low-risk changes do not need a full
document set. A direct user request may itself authorize implementation; do
not add approval pauses that the user has already resolved. For ambiguous
product, data, or security decisions, stop and get clarification before
proceeding.

## Human and operational boundaries

- The skill guides work; it does not enforce approvals or make a technical
  review equivalent to human approval.
- Do not create commits, merge pull requests, or deploy to production unless
  explicitly requested by the user.
- Do not add autonomous agents, CI model calls, release hooks, or production
  credentials as part of this workflow setup.
- Treat monitoring evidence and generated recommendations as inputs for human
  triage, not authorization to change production.

## Artifact templates

- [`intent.md`](templates/intent.md) — request and success criteria
- [`spec.md`](templates/spec.md) — accepted requirements and design
- [`plan.md`](templates/plan.md) — implementation sequence and verification
- [`incident.md`](templates/incident.md) — issue evidence and follow-up

