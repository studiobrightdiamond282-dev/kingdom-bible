'use strict';
const fs = require('fs');
const path = require('path');
const pub = path.join(__dirname, '..', 'public');
const web = JSON.parse(fs.readFileSync(path.join(pub, 'data', 'bible_web.json'), 'utf8')).books;
const kjv = JSON.parse(fs.readFileSync(path.join(pub, 'data', 'bible_kjv.json'), 'utf8')).books;
const tail = (label, arr, from) => {
  console.log('--- ' + label + ' (' + arr.length + ') ---');
  arr.forEach((v, i) => { if (i >= from) console.log('  ' + (i + 1) + ': ' + v.slice(0, 100)); });
};
tail('WEB Romans 16', web[44][15], 16);
tail('KJV Romans 16', kjv[44][15], 22);
tail('WEB Romans 14', web[44][13], 22);
