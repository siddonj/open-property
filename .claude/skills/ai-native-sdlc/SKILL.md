---
name: ai-native-sdlc
description: "Use when planning or implementing a substantial feature, bug fix, release review, or incident follow-up in this repository. Applies the Plan, Design, Build, Test, Deploy, Maintain workflow with linked intent, spec, and plan artifacts."
argument-hint: "[change request or path to an intent/spec]"
---

# AI-native SDLC

Use this workflow to keep a change traceable from user intent through review.
Read [the repository SDLC guide](../../../docs/sdlc/README.md) and use the
templates under `docs/sdlc/templates/` when creating artifacts.

## Procedure

1. **Plan:** Understand the request and existing code before proposing changes.
   For substantial work, create
   `docs/sdlc/changes/<slug>/intent.md` from the intent template. Clarify
   material ambiguity and preserve explicit user constraints. The root
   `intent.md` is the product roadmap; do not replace it with a change record.
2. **Design:** For substantial or cross-cutting work, create `spec.md` beside
   the intent. Cover behavior, user experience, data/API impact, risks,
   acceptance criteria, and open questions. Get the user's approval before
   implementation unless their request already clearly authorizes the scoped
   implementation.
3. **Build:** Agree on a concise `plan.md` for substantial work, listing files,
   order, risk, and proof. Implement surgically, follow repository patterns,
   and update the plan if the implementation materially diverges.
4. **Test:** Run `pnpm typecheck` and `pnpm build` after code changes. There is
   no configured automated test suite today; never claim otherwise. For
   relevant UI changes, inspect the browser result when browser tools are
   available. Fix failures caused by the change and report checks that could
   not be run.
5. **Deploy:** Review the diff against the intent, spec, plan, and
   `REVIEW.md`. Report prioritized findings and verification. Human approval
   remains necessary for merge or deployment.
6. **Maintain:** For an incident or operational defect, capture evidence,
   impact, affected systems, and follow-up in `incident.md`. Route any fix
   through the same review and verification steps.

## Guardrails

- Scale artifact formality to risk. A small, clear fix may use a brief plan
  rather than all three documents.
- Ask for clarification when a consequential product, data, security, or
  release decision is unresolved; do not invent approval.
- Do not create commits, merge, deploy, invoke production systems, or set up
  unattended CI/monitoring actions unless explicitly requested.
- Do not put credentials, secrets, or unnecessary personal data in artifacts.
- Treat this skill as workflow guidance, not a deterministic approval control.
