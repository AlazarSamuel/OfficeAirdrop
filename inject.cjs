const fs = require('fs');

const replacementHtml = fs.readFileSync('C:/Users/Editor 2/Documents/Office Share/mobile.html', 'utf8');

let content = fs.readFileSync('C:/Users/Editor 2/Documents/Office Share/electron/network.js', 'utf8');

const startIdx = content.indexOf('  getMobileHtml() {');
const endIdx = content.indexOf('// ── File Receiving ──────────────────────────────────────');

if (startIdx === -1 || endIdx === -1) {
  console.log("Could not find boundaries!");
  process.exit(1);
}

const before = content.substring(0, startIdx);
const after = content.substring(endIdx);

const finalStr = before + '  getMobileHtml() {\n    return `' + replacementHtml.replace(/`/g, '\\`').replace(/\$\{/g, '\\${') + '`;\n  }\n\n  ' + after;

fs.writeFileSync('C:/Users/Editor 2/Documents/Office Share/electron/network.js', finalStr);
console.log("Successfully replaced!");
