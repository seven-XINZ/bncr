/**
 * @author xinz
 * @name 插件体检
 * @team xinz
 * @description 静态体检全部活动插件：语法、加密块、元信息、重复规则、缺失依赖
 * @platform qq tgBot wxClawBot wxQianxun wxXyo HumanTG web ssh
 * @rule ^插件体检$
 * @rule ^插件体检\s+(详情|依赖|刷新)$
 * @admin true
 * @public false
 * @priority 1000001
 * @disable false
 * @classification ["运维"]
 * @license MIT
 * @repo https://github.com/seven-XINZ/bncr
 * @updated 2026-11-28
 * @version 2.0.0
 */
'use strict';

const fs = require('fs');
const path = require('path');
const Module = require('module');
const vm = require('vm');
const link = require('./mod/link');
const kit = require('./mod/plugin-kit');

const CACHE_MS = 5 * 60 * 1000;
let cache = { at: 0, report: null };

const FORBIDDEN = [
    { re: /Code\s+Encryption\s+Block/i, label: 'Bncr 加密块' },
    { re: /HideStart|HideEnd/, label: '加密标记' },
    { re: /\beval\s*\(/, label: 'eval 动态执行' },
    { re: /\bnew\s+Function\s*\(/, label: 'new Function 动态执行' },
];

const BUILTINS = new Set(Module.builtinModules.concat(Module.builtinModules.map(x => 'node:' + x)));

function lineOf(code, index) {
    return code.slice(0, index).split(/\r?\n/).length;
}

function checkFile(meta) {
    const issues = [];
    let code = '';
    try {
        code = fs.readFileSync(meta.abs, 'utf8');
    } catch (e) {
        return [{ type: '读取失败', detail: e.message }];
    }

    const self = path.resolve(__filename);
    if (meta.abs !== self) {
        for (const rule of FORBIDDEN) {
            const m = rule.re.exec(code);
            if (m) issues.push({ type: rule.label, detail: `第 ${lineOf(code, m.index)} 行` });
        }
    }

    try {
        // Bncr 插件以 CommonJS 包装执行，顶层 return 合法；compileFunction 只编译不执行
        vm.compileFunction(code);
    } catch (e) {
        issues.push({ type: '语法错误', detail: e.message.split('\n')[0] });
    }

    if (!meta.description) issues.push({ type: '缺 @description', detail: meta.file });
    if (!meta.license) issues.push({ type: '缺 @license', detail: meta.file });
    if (!meta.classification) issues.push({ type: '缺 @classification', detail: meta.file });
    if (!meta.platform) issues.push({ type: '缺 @platform', detail: meta.file });
    if (!meta.rules.length) issues.push({ type: '缺 @rule/@cron', detail: meta.file });
    if (meta.name !== path.basename(meta.file, '.js')) {
        issues.push({ type: '名称与文件名不一致', detail: `${meta.name} ≠ ${path.basename(meta.file, '.js')}` });
    }

    const reqs = [...code.matchAll(/require\(['"]([^'"]+)['"]\)/g)].map(m => m[1]);
    const deps = [...new Set(reqs)].filter(d => !d.startsWith('.') && !d.startsWith('/') && !BUILTINS.has(d));
    const missing = [];
    for (const dep of deps) {
        try {
            Module.createRequire(meta.abs).resolve(dep);
        } catch (e) {
            missing.push(dep);
        }
    }
    if (missing.length) issues.push({ type: '依赖未安装', detail: missing.join(', ') });
    return issues;
}

function buildReport(force) {
    if (!force && cache.report && Date.now() - cache.at < CACHE_MS) return cache.report;

    const plugins = link.listActive();
    const byName = new Map();
    const byRule = new Map();
    const rows = [];
    for (const meta of plugins) {
        if (byName.has(meta.name)) {
            rows.push({ meta, issues: [{ type: '插件重名', detail: byName.get(meta.name).file }] });
        } else {
            byName.set(meta.name, meta);
        }
        for (const rule of meta.rules) {
            if (!rule) continue;
            const key = rule.replace(/\s+/g, ' ');
            const catchAll = /\[\\s\\S\]/.test(key) && !/[\u4e00-\u9fa5A-Za-z0-9]{2,}/.test(key.replace(/\[\\s\\S\][+*]?/g, ''));
            const old = byRule.get(key);
            if (old && old.name !== meta.name && !catchAll) {
                rows.push({ meta, issues: [{ type: '规则重复', detail: `${key} ← ${old.name}` }] });
            } else if (!old) {
                byRule.set(key, meta);
            }
        }
        rows.push({ meta, issues: checkFile(meta) });
    }

    const issueCounts = {};
    for (const row of rows) {
        for (const issue of row.issues) issueCounts[issue.type] = (issueCounts[issue.type] || 0) + 1;
    }
    const report = { at: Date.now(), stats: link.stats(), plugins, rows, issueCounts };
    cache = { at: report.at, report };
    return report;
}

function summary(report) {
    const bad = report.rows.filter(r => r.issues.length);
    const lines = [
        '🩺 插件体检报告',
        `活动插件: ${report.stats.active} | 官方: ${report.stats.official} | 归档: ${report.stats.archive}`,
        `健康: ${report.plugins.length - bad.length} | 有问题: ${bad.length}`,
        '',
    ];
    const order = ['Bncr 加密块', '加密标记', 'eval 动态执行', 'new Function 动态执行', '语法错误', '插件重名', '规则重复', '名称与文件名不一致', '依赖未安装', '缺 @rule/@cron', '缺 @description', '缺 @license', '缺 @classification', '缺 @platform'];
    for (const type of order) {
        if (report.issueCounts[type]) lines.push(`• ${type}: ${report.issueCounts[type]}`);
    }
    for (const key of Object.keys(report.issueCounts)) {
        if (!order.includes(key)) lines.push(`• ${key}: ${report.issueCounts[key]}`);
    }
    if (bad.length) {
        lines.push('', '前 8 个问题插件：');
        for (const row of bad.slice(0, 8)) {
            lines.push(`- ${row.meta.name} (${row.meta.file})`);
            for (const issue of row.issues.slice(0, 3)) lines.push(`  · ${issue.type}: ${issue.detail}`);
        }
    }
    lines.push('', '发送「插件体检 详情」看全部问题，「插件体检 依赖」只看依赖。');
    return lines.join('\n');
}

function detail(report) {
    const bad = report.rows.filter(r => r.issues.length);
    if (!bad.length) return '✅ 所有活动插件均通过体检。';
    const lines = [`🩺 插件体检详情（${bad.length} 个）`];
    for (const row of bad) {
        lines.push('', `【${row.meta.name}】${row.meta.file}  v${row.meta.version}`);
        for (const issue of row.issues) lines.push(`· ${issue.type}: ${issue.detail}`);
    }
    return lines.join('\n');
}

function dependencyReport(report) {
    const missing = [];
    for (const row of report.rows) {
        const dep = row.issues.find(i => i.type === '依赖未安装');
        if (dep) missing.push(`${row.meta.name}: ${dep.detail}`);
    }
    if (!missing.length) return '✅ 未发现缺失的第三方依赖。';
    return ['📦 缺失依赖', ...missing.map(x => '· ' + x), '', '可在容器 BncrData 目录执行 npm install <包名> 补装。'].join('\n');
}

module.exports = kit.guard('插件体检', async s => {
    const action = String((s.param && s.param(1)) || '').trim();
    const report = buildReport(action === '刷新');
    let text;
    if (action === '详情') text = detail(report);
    else if (action === '依赖') text = dependencyReport(report);
    else text = summary(report);
    await kit.replyLong(s, text);
});
