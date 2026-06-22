import { config } from 'dotenv';
config({ path: '.env.local' });

import { correlateSignals } from './correlation-runner.js';

async function main() {
  console.log('Running correlation engine...\n');
  
  const result = await correlateSignals();
  
  console.log('\n=== Correlation Complete ===');
  console.log('Signals analyzed:', result.signalsAnalyzed);
  console.log('Themes created:', result.themesCreated);
  console.log('Inferences generated:', result.inferencesGenerated);
  console.log('Debates created:', result.debatesCreated);
  
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
