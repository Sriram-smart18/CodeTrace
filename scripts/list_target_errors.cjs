const fs = require('fs');
const path = require('path');

const reportPath = path.join(__dirname, '..', 'eslint_report.json');
let raw = fs.readFileSync(reportPath, 'binary');
if (raw.charCodeAt(0) === 0xFF && raw.charCodeAt(1) === 0xFE) {
  raw = fs.readFileSync(reportPath, 'utf16le');
} else {
  raw = fs.readFileSync(reportPath, 'utf8');
}
if (raw.charCodeAt(0) === 0xFEFF) {
  raw = raw.substring(1);
}
const data = JSON.parse(raw);

const targetFiles = [
  'Monitoring.tsx',
  'LiveSession.tsx',
  'Dashboard.tsx',
  'useActivityTracker.ts',
  'useBehavioralLogger.ts',
  'useAnalyticsQueries.ts',
  'NotificationCenter.tsx',
  'AssignmentDetail.tsx',
  'types.ts',
  'check-plagiarism/index.ts',
  'detect-fraud/index.ts',
  'evaluate-submission/index.ts'
];

let out = '';

data.forEach((file) => {
  const matches = targetFiles.some(tf => file.filePath.endsWith(tf) || file.filePath.includes(tf.replace(/\//g, path.sep)));
  if (matches) {
    out += `File: ${file.filePath}\n`;
    file.messages.forEach((m) => {
      out += `  Line ${m.line}:${m.column} - [${m.ruleId}] ${m.message}\n`;
    });
    out += '\n';
  }
});

fs.writeFileSync(path.join(__dirname, 'eslint_errors_details_pass3.txt'), out, 'utf8');
console.log('Done!');
