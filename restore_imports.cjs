const fs = require('fs');
let css = fs.readFileSync('src/index.css', 'utf8');

const imports = `@import 'tailwindcss';
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
`;

css = css.split('\n').filter(line => !line.includes('@import')).join('\n');
fs.writeFileSync('src/index.css', imports + '\n' + css);
console.log('Restored @import statements');
