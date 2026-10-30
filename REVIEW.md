# Review instructions

Review the proposed diff against the user's request and, when present, the
change's `intent.md`, `spec.md`, and `plan.md`. Report only actionable findings
introduced by the diff or made materially worse by it.

## Review passes

- **Correctness:** Look for broken behavior, edge cases, regressions, and
  incorrect assumptions about existing flows.
- **Security and privacy:** Check input validation, authorization boundaries,
  unsafe data handling, and accidental exposure of secrets or personal data.
- **Data integrity:** Check schema and API behavior, persistence, lifecycle
  consistency, and failure handling.
- **Scope and compatibility:** Check that the change meets its accepted intent
  and constraints without introducing excluded integrations or unrelated
  behavior.
- **Verification:** Confirm the stated checks are appropriate and actually
  reported. A typecheck or build is not proof of runtime behavior.

## Finding format

For each finding, include severity, file and line, impact, and confidence.
Prioritize issues that could break behavior, lose or expose data, or violate an
accepted requirement. Do not report style preferences, speculative concerns
without a concrete path to impact, or unrelated pre-existing issues.

## Approval boundary

Review findings inform a human decision; they do not approve a merge or release.
Do not commit, merge, or deploy as a consequence of review unless explicitly
requested.
