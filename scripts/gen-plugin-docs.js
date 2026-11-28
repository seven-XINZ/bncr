#!/usr/bin/env node
/**
 * 生成 docs/PLUGINS.md：按分类列出全部非官方活动插件
 * 用法：node scripts/gen-plugin-docs.js [--apply]
 */
'use strict';

const fs = require('fs');
const path = require('path');
const link = require('../plugins/xinz/mod/link');

const apply = process.argv.includes('--apply');
const plugins = link.listActive().slice().sort((a, b) => {
    const ca = a.classification || '未分类';
    const cb = b.classification || '未分类';
    return ca.localeCompare(cb, 'zh') || a.name.localeCompare(b.name, 'zh');
});
const stats = link.stats();

const groups = new Map();
for (const p of plugins) {
    const key = p.classification || '未分类';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
}

const lines = [
    '# 插件清单',
    '',
    `> 自动生成，请勿手工编辑。当前活动插件 **${stats.active}** 个，官方 ${stats.official} 个，归档 ${stats.archive} 个。`,
    '> 生成命令：`node scripts/gen-plugin-docs.js --apply`',
    '',
    '| 分类 | 插件 | 版本 | 许可 | 更新时间 | 文件 |',
    '|---|---|---|---|---|---|',
];
for (const [category, items] of groups) {
    for (const p of items) {
        lines.push(`| ${category} | ${p.name} | ${p.version} | ${p.license || '-'} | ${p.updated || '-'} | \`${p.file}\` |`);
    }
}

const text = lines.join('\n') + '\n';
console.log(`${apply ? '写入' : '预演'} docs/PLUGINS.md：${plugins.length} 个活动插件，${groups.size} 个分类`);
console.log([...groups].map(([k, v]) => `${k}: ${v.length}`).join(' | '));
if (apply) {
    fs.writeFileSync(path.join(__dirname, '..', 'docs', 'PLUGINS.md'), text);
    console.log('已写入。');
}
