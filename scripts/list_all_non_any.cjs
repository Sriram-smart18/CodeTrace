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

data.forEach((file) => {
  const nonAnyMessages = file.messages.filter(m => m.ruleId !== '@typescript-eslint/no-explicit-any');
  if (nonAnyMessages.length > 0) {
    console.log(`File: ${file.filePath}`);
    nonAnyMessages.forEach((m) => {
      console.log(`  Line ${m.line}:${m.column} - [${m.ruleId}] ${m.message}`);
    });
    console.log('');
  }
});
