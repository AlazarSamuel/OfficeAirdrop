const fs = require('fs');
const text = fs.readFileSync('src/index.css', 'utf8');

// Find the line where the first real css file ends.
// From our view_file, line 181 is:
//   text-transform: uppercase;
// }
// And line 182 is @import url(...)

const lines = text.split('\n');
const importLineIndices = [];
for (let i = 0; i < lines.length; i++) {
  if (lines[i].startsWith('@import url')) {
    importLineIndices.push(i);
  }
}

console.log('Import lines found at:', importLineIndices);

if (importLineIndices.length > 1) {
  // We want to keep everything up to (but not including) the second occurrence.
  const secondImportIndex = importLineIndices[1];
  
  // Create the cleaned lines array
  const cleanedLines = lines.slice(0, secondImportIndex);
  
  const cleanedText = cleanedLines.join('\n');
  fs.writeFileSync('src/index.css', cleanedText);
  console.log('Fixed! Truncated file. New lines length:', cleanedLines.length);
} else {
  console.log('Did not find multiple imports.');
}
