# Error report

Date: 2026-10-15

## Full test suite retry

Command: `npm test`

Result: 2 failed, 1,095 passed across 107 test files.

### Failures

- `src/__tests__/aiTraceTerms.test.ts`: `aiTrace score terms > matches the pre-refactor full enemy turn fixture exactly with deterministic randomness` expected `emberTerm` to be `0.3334` but received `0.4` (`src/__tests__/aiTraceTerms.test.ts:377`).
- `src/__tests__/spawnBudget.test.ts`: `budget math > uses the frontmost player stronghold for DDA margin instead of the frontmost unit` expected `ddaRelief` to be close to `-2.75` but received `-3` (`src/__tests__/spawnBudget.test.ts:296`).

These are the same two failures observed in the previous full-suite run. The retry initially could not start because dependencies were missing (`vitest: not found`); after `npm ci --legacy-peer-deps`, the suite ran and reproduced both failures.

## Related GitHub Actions error

The Copilot cloud-agent workflow run [38689465792](https://github.com/t-h-omy/Volcanae/actions/runs/38689465792) failed after CodeQL completed successfully. The agent runtime failed to send its PR summary after three HTTP 500 responses. This is separate from the local Vitest failures.
