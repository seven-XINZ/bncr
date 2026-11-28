#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..', 'plugins', 'xinz');
const files = fs.readdirSync(root).filter(f => f.endsWith('.js'));
let failed = 0;
for (const file of files) {
    const abs = path.join(root, file);
    try {
        execFileSync(process.execPath, ['--check', abs], { stdio: 'pipe' });
        console.log('OK   ' + file);
    } catch (e) {
        failed++;
        console.error('FAIL ' + file + '\n' + String(e.stderr || e.message).trim());
    }
}
console.log(`\n${files.length - failed}/${files.length} 通过语法检查`);
process.exit(failed ? 1 : 0);
