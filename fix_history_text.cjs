const fs = require('fs');
let text = fs.readFileSync('src/views/TransfersView.jsx', 'utf8');

text = text.replace(/>Transfer history</g, '>Transfers<');
text = text.replace(/aria-label="Search history"/g, 'aria-label="Search transfers"');
text = text.replace(/Removed from history\./g, 'Removed from transfers.');
text = text.replace(/No history records found\./g, 'No transfers found.');

fs.writeFileSync('src/views/TransfersView.jsx', text);
console.log('Fixed user-facing strings in TransfersView.jsx');
