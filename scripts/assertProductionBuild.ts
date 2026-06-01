import * as fs from 'fs';
import * as path from 'path';

function scanDirectory(dir: string, fileList: string[] = []): string[] {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      scanDirectory(filePath, fileList);
    } else {
      fileList.push(filePath);
    }
  }
  return fileList;
}

const distDir = path.resolve(process.cwd(), 'dist/assets');

if (!fs.existsSync(distDir)) {
  console.error('[ASSERT FATAL] Build directory not found. Run npm run build first.');
  process.exit(1);
}

const chunks = scanDirectory(distDir).filter(f => f.endsWith('.js'));

if (chunks.length === 0) {
  console.error('[ASSERT FATAL] No javascript chunks found in dist/assets.');
  process.exit(1);
}

const disallowedStrings = [
  '__CODETRACE_START_STRESS_TESTS__',
  'IdeDiagnosticsPanel',
  'IDE Diagnostics (Ctrl+Shift+D)',
  '[STRESS TEST] STARTING ALL STRESS SIMULATIONS',
  '[STRESS TEST] ABORTING ALL STRESS SIMULATIONS'
];

let failed = false;

for (const chunk of chunks) {
  const content = fs.readFileSync(chunk, 'utf-8');
  for (const str of disallowedStrings) {
    if (content.includes(str)) {
      console.error(`[ASSERT FAILED] Production bundle contains disallowed string: "${str}" in file: ${path.basename(chunk)}`);
      failed = true;
    }
  }
}

if (failed) {
  console.error('[ASSERT FAILED] Build contains debug artifacts. Dead code elimination failed.');
  process.exit(1);
} else {
  console.log('[ASSERT SUCCESS] Production chunks are clean. Debug features successfully stripped.');
  process.exit(0);
}
