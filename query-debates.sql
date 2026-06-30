SELECT id, "analystClaim", "gossipClaim", LEFT("debateTranscript", 1000) as transcript_preview FROM "CrossSignalDebate" LIMIT 3;
