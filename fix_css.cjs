const fs = require('fs');
const text = fs.readFileSync('src/index.css', 'utf8');
const searchString = "@import \\\"tailwindcss\\\";";
const firstIndex = text.indexOf(searchString);
if (firstIndex !== -1) {
  const secondIndex = text.indexOf(searchString, firstIndex + 10);
  if (secondIndex !== -1) {
    // The previous @import url(...) is right before this. Let's find it.
    const importUrlString = "@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500&display=swap');";
    const secondImportUrlIndex = text.lastIndexOf(importUrlString, secondIndex);
    
    if (secondImportUrlIndex !== -1 && secondImportUrlIndex > firstIndex) {
      const cleaned = text.substring(0, secondImportUrlIndex);
      fs.writeFileSync('src/index.css', cleaned);
      console.log('Fixed index.css! New length:', cleaned.split('\\n').length);
    } else {
      console.log('Could not find the duplicate @import url before the second tailwind css import.');
    }
  } else {
    console.log('Second tailwindcss import not found. File may be fine.');
  }
} else {
  console.log('First tailwindcss import not found.');
}
