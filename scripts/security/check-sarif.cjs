'use strict';
const fs = require('node:fs');
const path = require('node:path');
function securityFindings(report) {
  if (report.version !== '2.1.0' || !Array.isArray(report.runs) || !report.runs.length) throw new Error('Invalid or empty SARIF report.');
  return report.runs.flatMap(run => {
    if (!Array.isArray(run.results)) throw new Error('SARIF results missing.');
    const rules = [...(run.tool?.driver?.rules || []), ...(run.tool?.extensions || []).flatMap(extension => extension.rules || [])];
    return run.results.filter(result => {
      const rule = rules.find(item => item.id === result.ruleId);
      // Gate all severities, including notes: a successful scanner run alone is insufficient.
      return rule?.properties?.tags?.includes('security') || Number(rule?.properties?.['security-severity']) > 0 ||
        ['error', 'warning'].includes(result.level || rule?.defaultConfiguration?.level || 'warning');
    });
  });
}
if (require.main === module) {
  const directory = process.argv[2];
  const files = fs.readdirSync(directory).filter(file => file.endsWith('.sarif'));
  if (!files.length) throw new Error('No SARIF files were produced.');
  let total = 0;
  for (const file of files) {
    const findings = securityFindings(JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8')));
    total += findings.length;
    for (const result of findings) {
      const location = result.locations?.[0]?.physicalLocation;
      console.log(JSON.stringify({ rule: result.ruleId, file: location?.artifactLocation?.uri,
        line: location?.region?.startLine, message: result.message?.text }));
    }
  }
  console.log(`CodeQL security findings: ${total}`);
  if (total) process.exitCode = 1;
}
module.exports = { securityFindings };
