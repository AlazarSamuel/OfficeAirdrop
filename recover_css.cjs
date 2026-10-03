const fs = require('fs');
const path = require('path');
const logPath = 'c:\\\\Users\\\\hp\\\\.gemini\\\\antigravity-ide\\\\brain\\\\de38988f-fac0-4105-ad68-49b23d7a1236\\\\.system_generated\\\\logs\\\\transcript_full.jsonl';

const lines = fs.readFileSync(logPath, 'utf8').split('\\n');
let bestCss = '';
let bestLength = 0;

for (const line of lines) {
  if (!line.trim()) continue;
  try {
    const entry = JSON.parse(line);
    // Look for tool executions or responses containing index.css
    if (entry.content && entry.content.includes('.settings-card')) {
        // Is this a file output or a diff?
        // Maybe it's a huge string of CSS. Let's just find the longest continuous CSS-looking string? No, let's look for "Created file" or view_file output.
    }
    
    // Check if it's a view_file output
    if (entry.type === 'TOOL_RESPONSE' || entry.type === 'RUN_COMMAND') {
        const out = entry.content || '';
        if (out.includes('font-family: \'Inter\'') && out.includes('.settings-card')) {
            if (out.length > bestLength) {
                bestLength = out.length;
                bestCss = out;
            }
        }
    }
  } catch (e) {
    // ignore parse errors for partial lines
  }
}

if (bestLength > 0) {
    console.log('Found a good candidate! Length:', bestLength);
    fs.writeFileSync('recovered_css_candidate.txt', bestCss);
} else {
    console.log('No candidate found in transcript_full.');
}
