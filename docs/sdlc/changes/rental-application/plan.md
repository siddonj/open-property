# Plan: Complete rental application

Spec: [`spec.md`](./spec.md)

## Files, in order

1. `migrations/0005_rental_application.sql`: nullable columns on
   `applications` and the `application_income_multiple` setting.
2. `src/server/index.ts`, Applications section:
   - Zod schemas per section.
   - JSON columns stringified on write and parsed on read.
   - One shared SELECT (it currently appears 3 times), joining unit rent and decider/verifier names.
   - The server sets `decided_at`/`decided_by` and `verified_by`.
   - Settings gains `application_income_multiple`.
3. `src/client/types.ts` and `hooks/use-app-state.ts`: new fields and the new setting.
4. `src/client/lib/applications.ts`: decide-by date, income totals and ratio, missing required fields, refund flags.
5. `src/client/components/applications/application-fields.tsx`: `FieldGrid` and `ListEditor`, reused by every repeatable section.
6. `application-dialog.tsx`: one draft object and tabs. `applications-page.tsx`: Decide-by and income-to-rent columns, refund flags, emergency contact in the tenant prefill.
7. `settings-page.tsx`: income multiple input.

## Implementation choices

- **Column name:** the list column is `personal_references`, because `references` is an SQL keyword.
- **Income list:** one income list for the whole household, with an optional earner per row. `monthly_income` is kept in sync as the household total, so the existing list column and the tenant prefill keep working. Legacy rows that have no income list show their old value.
- **Money:** amounts in the JSON lists are integer cents (`*_cents`).

## Risk

- **Migration:** adds only nullable columns plus one `INSERT OR IGNORE`, so existing rows are untouched.
- **Biggest change:** the dialog rewrite. I'll check it in the browser against seeded data.

## As built

- **Decline notes:** "Notes required for Other" is checked in the dialog only, not by the API.
- **Complete date:** marking it complete is gated on the required fields, but the date field itself can still be typed by hand.
- **Saving an older application:** the first save turns its old employer and income into an income row. Activity history records that once.

## Proof

- `pnpm typecheck` and `pnpm build`.
- Migration applied to a throwaway copy, then the API exercised through a temporary Worker: create, update, decide and verify, with activity history checked.
- The dialog checked in the browser against seeded data.
- `scripts/check-auth.mjs` run against a throwaway Worker.
