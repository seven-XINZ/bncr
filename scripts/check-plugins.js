#!/usr/bin/env node
'use strict';
/**
 * 插件仓库体检：
 * 1) 递归扫描 plugins/ 下所有 .js，逐个做语法检查；
 * 2) 拦截加密块、加密标记、动态执行、超长混淆行；
 * 3) 检查插件元信息（@name / @rule 或 @cron）。
 *
 * 用法：node scripts/check-plugins.js
 * 退出码：0 全部通过；1 存在错误。
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..', 'plugins');

/** 内部模块目录，不要求插件元信息 */
const INTERNAL_DIRS = new Set(['mod']);
/** 历史归档目录，仍检查语法与明文，但元信息只告警 */
const ARCHIVE_DIRS = new Set(['_archive']);

const FORBIDDEN = [
    { re: /Code Encryption Block/i, name: 'Bncr 加密块' },
    { re: /\/\*\s*HideStart\s*\*\//, name: 'HideStart 加密标记' },
    { re: /\/\*\s*HideEnd\s*\*\//, name: 'HideEnd 加密标记' },
    { re: /\beval\s*\(/, name: 'eval 动态执行' },
    { re: /\bnew\s+Function\s*\(/, name: 'new Function 动态执行' },
    { re: /\batob\s*\(/, name: 'atob 解码（疑似混淆）' },
];

function walk(dir, out = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const abs = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(abs, out);
        else if (entry.name.endsWith('.js')) out.push(abs);
    }
    return out;
}

const files = walk(root);
let failed = 0;
let warned = 0;

for (const abs of files) {
    const rel = path.relative(root, abs);
    const parts = rel.split(path.sep);
    const internal = parts.some((p) => INTERNAL_DIRS.has(p));
    const archive = parts.some((p) => ARCHIVE_DIRS.has(p));
    const code = fs.readFileSync(abs, 'utf8');
    const problems = [];

    // 语法检查
    try {
        execFileSync(process.execPath, ['--check', abs], { stdio: 'pipe' });
    } catch (e) {
        problems.push('语法错误: ' + String(e.stderr || e.message).trim().split('\n')[0]);
    }

    // 加密 / 动态执行 / 混淆
    code.split('\n').forEach((line, i) => {
        for (const rule of FORBIDDEN) {
            if (rule.re.test(line)) problems.push(`第 ${i + 1} 行: ${rule.name}`);
        }
        if (line.length > 1500) problems.push(`第 ${i + 1} 行: 单行 ${line.length} 字符，疑似压缩/混淆`);
    });

    // 插件元信息
    const meta = code.match(/@name\s+(.+)/);
    if (!internal) {
        if (!meta) problems.push('缺少 @name 元信息');
        if (!/@rule\s|@cron\s/.test(code)) {
            const msg = '缺少 @rule/@cron 触发定义';
            archive ? warned++ && console.warn(`WARN ${rel} - ${msg}`) : problems.push(msg);
        }
    }

    if (problems.length) {
        failed++;
        console.error(`FAIL ${rel}`);
        problems.forEach((p) => console.error('     - ' + p));
    } else {
        console.log(`OK   ${rel}${meta ? ` (${meta[1].trim()})` : ''}`);
    }
}

console.log(`\n共 ${files.length} 个 JS：${files.length - failed} 通过，${failed} 失败，${warned} 告警`);
console.log('检查项：语法 / 加密块 / 加密标记 / eval / new Function / atob / 超长混淆行 / 元信息');
process.exit(failed ? 1 : 0);
