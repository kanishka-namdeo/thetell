# Pipeline Test Report: Hybrid Agent Routing

**Date**: 2026-06-22  
**Test**: Verify hybrid agent routing with sourceMatchPreference confidence boost

---

## Test Results

### ✅ Database Cleared Successfully
- **Signals deleted**: 45
- **Analyses deleted**: 90
- **Companies preserved**: 7

### ✅ Pipeline Re-run Completed
- **New signals scraped**: 6 (all NEWS type)
- **Analyses created**: 7 (4 Analyst, 3 Gossip Girl)
- **Note**: Some Gossip Girl analyses failed due to JSON parsing errors (3 out of 6)

### ✅ Hybrid Agent Routing Verified

#### Evidence from Database:

1. **Analyst got preference boost for NEWS signals**
   - Signal: "Finding the Best Dog Treat with Statistics"
     - Analyst confidence: **0.861** (sourceMatchPreference: **true**)
     - Gossip Girl confidence: **0.438** (sourceMatchPreference: **false**)
     - Difference: 0.424 ✓

   - Signal: "Steam Machine"
     - Analyst confidence: **0.817** (sourceMatchPreference: **true**)
     - Gossip Girl confidence: **0.438** (sourceMatchPreference: **false**)
     - Difference: 0.379 ✓

   - Signal: "Doorbell cam filmed Tesla Autopilot crash"
     - Analyst confidence: **0.703** (sourceMatchPreference: **true**)
     - Gossip Girl confidence: **0.540** (sourceMatchPreference: **false**)
     - Difference: 0.164 ✓

2. **Analyses with source match preference**: 4 out of 7
   - All 4 Analyst analyses have `sourceMatchPreference: true`
   - All 3 Gossip Girl analyses have `sourceMatchPreference: false`

### ✅ Logs Confirm Preference Matching

From pipeline logs:
```
{"level":20,"msg":"agent.pipeline.preference_match","sourceType":"NEWS","agentPersona":"ANALYST","matches":true,"confidenceBoost":"1.15x"}
{"level":20,"msg":"agent.pipeline.preference_match","sourceType":"NEWS","agentPersona":"GOSSIP_GIRL","matches":false,"confidenceBoost":"none"}
```

---

## How It Works

1. **Source Type Matching**: The system checks if the signal's `sourceType` matches the agent's `sourcePreferences`
   - Analyst prefers: `NEWS`, `FILING`, `TRANSCRIPT`
   - Gossip Girl prefers: `SOCIAL`, `BLOG`, `JOB_POSTING`

2. **Confidence Boost**: When there's a match, the confidence score gets a 1.15x multiplier
   - Applied in `calculateConfidence()` function
   - Helps route signals to the most appropriate agent

3. **Database Field**: `sourceMatchPreference` (Boolean?) is stored in the Analysis table
   - `true` = agent got the confidence boost
   - `false` = no boost

---

## Next Steps

To fully test the system, we should:
1. Scrape SOCIAL/BLOG signals to verify Gossip Girl gets the boost
2. Fix the JSON parsing errors in Gossip Girl analyses
3. Add more signal source types (GITHUB, FILING, TRANSCRIPT) to test all preference combinations

---

## Conclusion

✅ **The hybrid agent routing system is working as designed!**

The `sourceMatchPreference` field is being populated correctly, and the confidence boost is being applied when an agent's preferences match the signal source type.
