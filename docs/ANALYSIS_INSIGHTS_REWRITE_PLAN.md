# Analysis Insights Rewrite Plan (Archived)

This file is kept only as historical context for the first `/analysis` rewrite.
It is no longer the active plan.

## Current Source Of Truth

Use `docs/ANALYSIS_INSIGHTS_50_RULE_PLAN.md` for all current Hub insight logic,
copy, trigger, frequency, and review work.

## What This Archived Plan Covered

- Created `src/lib/analysis-core.ts` as the shared `/analysis` calculation
  source for ELO, player metrics, partner/opponent edges, profiles, and Hub
  insights.
- Moved Hub, Profile, and Network to read from the same analysis snapshot.
- Replaced ad hoc insight calculations with a typed rule registry.
- Added anti-spam selection rules for the Hub feed.

## Why It Was Archived

The first rewrite solved the shared-data architecture but did not fully capture
the requested 50+ scenario dictionary. The active 52-scenario plan now lives in
`docs/ANALYSIS_INSIGHTS_50_RULE_PLAN.md`.
