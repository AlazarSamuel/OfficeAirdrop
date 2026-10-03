const fs = require('fs');

// 1. Rename file
if (fs.existsSync('src/views/HistoryView.jsx')) {
  fs.renameSync('src/views/HistoryView.jsx', 'src/views/TransfersView.jsx');
  console.log('Renamed HistoryView.jsx to TransfersView.jsx');
}

// 2. Update App.jsx
let appJsx = fs.readFileSync('src/App.jsx', 'utf8');
appJsx = appJsx.replace(/import HistoryView from '\.\/views\/HistoryView'/g, `import TransfersView from './views/TransfersView'`);
appJsx = appJsx.replace(/HistoryView triggerToast=\{triggerToast\}/g, `TransfersView triggerToast={triggerToast}`);
appJsx = appJsx.replace(/<History size=\{18\} \/> History/g, `<ArrowRightLeft size={18} /> Transfers`);
appJsx = appJsx.replace(/import \{ Share, History/g, `import { Share, ArrowRightLeft`);

// 3. Keep 'history' as the internal state name for activeTab to avoid breaking other things, but if you want to replace it:
appJsx = appJsx.replace(/'history'/g, `'transfers'`);

fs.writeFileSync('src/App.jsx', appJsx);
console.log('Updated App.jsx');

// 4. Update TransfersView.jsx
if (fs.existsSync('src/views/TransfersView.jsx')) {
  let transfersJsx = fs.readFileSync('src/views/TransfersView.jsx', 'utf8');
  transfersJsx = transfersJsx.replace(/export default function HistoryView/g, `export default function TransfersView`);
  transfersJsx = transfersJsx.replace(/<Clock className="text-indigo-400" size=\{24\} \/>\s*History/g, `<ArrowRightLeft className="text-indigo-400" size={24} />\n            Transfers`);
  transfersJsx = transfersJsx.replace(/import \{ Folder, Trash2, Search, Filter, Play, Trash, Check, X, Clock/g, `import { Folder, Trash2, Search, Filter, Play, Trash, Check, X, ArrowRightLeft`);
  fs.writeFileSync('src/views/TransfersView.jsx', transfersJsx);
  console.log('Updated TransfersView.jsx');
}
