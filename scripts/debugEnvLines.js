const fs = require('fs');
const path = require('path');
const envPath = path.resolve(__dirname, '..', '.env.local');
const content = fs.readFileSync(envPath, 'utf8');
const lines = content.split(/\r?\n/);
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  console.log(`${i + 1}: ${line.replace(/\t/g, '\\t')}`);
}
console.log('--- total lines =', lines.length);
