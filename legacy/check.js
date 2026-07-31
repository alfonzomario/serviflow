const fs = require('fs');
const txt = fs.readFileSync('C:\\Users\\javie\\.gemini\\antigravity\\scratch\\lozanor-app\\index.html', 'utf8');
const idx = txt.indexOf('yyyy}-${pad2');
console.log('Char code is: ' + txt.charCodeAt(idx - 3));
console.log('Char is: ' + txt.charAt(idx - 3));
