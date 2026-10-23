'use strict';
const fs = require('node:fs');
const args = process.argv.slice(2);
if (args[0] === '--version') { console.log('codex-cli 0.164.0'); process.exit(0); }
if (args[0] === 'login') { console.log('Logged in (test fixture)'); process.exit(0); }
let prompt = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', data => { prompt += data; });
process.stdin.on('end', () => {
  if (prompt === 'hang') { setInterval(() => {}, 1000); return; }
  if (prompt === 'fail') { console.log(JSON.stringify({ type: 'turn.failed', error: { message: 'Model unavailable for this account.' } })); process.exitCode = 1; return; }
  if (!args.includes('read-only') || !args.includes('--ignore-user-config') ||
      !args.includes('features.shell_tool=false') || args.some(arg => arg.includes('dangerously'))) {
    throw new Error('Unsafe CLI arguments.');
  }
  const output = args[args.indexOf('--output-last-message') + 1];
  const claim = { claim: 'La Terra orbita attorno al Sole.', verdict: 'TRUE', confidence: 'HIGH',
    explanation: 'Le osservazioni astronomiche lo confermano.', sources: ['https://science.nasa.gov/earth/'],
    speaker: 'Unknown', speaker_confidence: 'MEDIUM', speaker_confidence_explanation: 'Affermazione diretta.' };
  const payload = prompt === 'invalid' ? { claims: [{ ...claim, verdict: 'MAYBE' }] } : { claims: [claim] };
  fs.writeFileSync(output, JSON.stringify(payload));
  if (args.includes('web_search="live"') && prompt !== 'no-search') console.log(JSON.stringify({ type: 'item.completed', item: { type: 'web_search', query: prompt } }));
  process.stdout.write(JSON.stringify({ type: 'turn.completed' }));
});
