#!/usr/bin/env node
/**
 * 批量规范非官方插件元信息：@version/@license/@repo/@platform/@classification/@updated
 * 用法：node scripts/upgrade-plugins.js [--apply] [--bump]
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PLUGIN_ROOT = path.join(ROOT, 'plugins');
const APPLY = process.argv.includes('--apply');
const BUMP = process.argv.includes('--bump');
const REPO = 'https://github.com/seven-XINZ/bncr';

function walk(dir, out = []) {
    for (const name of fs.readdirSync(dir)) {
        if (name === '官方插件' || name === '_archive' || name === 'mod' || name === 'data' || name === 'backups') continue;
        const full = path.join(dir, name);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) walk(full, out);
        else if (name.endsWith('.js')) out.push(full);
    }
    return out;
}

const VALID = ['AI', '工具', '娱乐', '数据', '群管理', '效率', '运维', '内容', '媒体'];

function inferClassification(name, file = '') {
    const s = `${name} ${file}`.toLowerCase();
    if (/chatgpt|gemini|dify|gpt|ai|大模型|智能/.test(s)) return 'AI';
    if (/娱乐|视频|小姐姐|pixiv|音乐|电影|壁纸|表情|图/.test(s)) return '娱乐';
    if (/数据|天气|汇率|新闻|60s|榜单|统计|查询/.test(s)) return '数据';
    if (/群管理|管理|踢|禁言|欢迎|撤回|广播|全体/.test(s)) return '群管理';
    if (/效率|提醒|签到|订阅|定时|任务|打卡|记账|纪念日/.test(s)) return '效率';
    if (/运维|状态|ssh|日志|备份|监控|体检|容器/.test(s)) return '运维';
    if (/内容|rss|订阅源|文章/.test(s)) return '内容';
    if (/媒体|影视|emby|nas/.test(s)) return '媒体';
    return '工具';
}

function normalizeClassification(value, name, file) {
    const v = String(value || '').replace(/[\[\]"']/g, '').trim();
    if (VALID.includes(v)) return v;
    if (v === '群管') return '群管理';
    if (v === '自动化') return '运维';
    if (/ai|gpt/i.test(v)) return 'AI';
    return inferClassification(name, file);
}

function bump(version) {
    const m = String(version || '').match(/(\d+)\.(\d+)\.(\d+)/);
    if (!m) return '2.0.0';
    const major = Number(m[1]);
    const minor = Number(m[2]);
    if (major < 2) return '2.0.0';
    return `${major}.${minor + 1}.0`;
}

function upgrade(file) {
    const code = fs.readFileSync(file, 'utf8');
    const header = code.match(/^\s*\/\*\*?([\s\S]*?)\*\//);
    if (!header || !/@name\s+/.test(header[1])) return null;

    const rel = path.relative(PLUGIN_ROOT, file);
    const body = header[1];
    const has = key => new RegExp('@' + key + '\\s+').test(body);
    const adds = [];
    const name = (body.match(/@name\s+([^\n\r*]+)/) || [])[1].trim();
    if (has('classification')) {
        const old = (body.match(/@classification\s+([^\n\r*]+)/) || [])[1].trim();
        const next = normalizeClassification(old, name, rel);
        if (next !== old.replace(/[\[\]"']/g, '').trim()) adds.push(`@classification ["${next}"]`);
    }

    if (!has('version')) adds.push('@version 2.0.0');
    else if (BUMP) {
        const v = (body.match(/@version\s+([^\n\r*]+)/) || [])[1].trim();
        adds.push(`@version ${bump(v)}`);
    }
    if (!has('license')) adds.push('@license MIT');
    if (!has('repo')) adds.push(`@repo ${REPO}`);
    if (!has('platform')) adds.push('@platform qq tgBot wxClawBot wxQianxun wxXyo HumanTG web ssh');
    if (!has('updated')) adds.push('@updated 2026-11-28');
    if (!has('classification')) adds.push(`@classification ["${inferClassification(name, rel)}"]`);

    if (!adds.length && !BUMP) return null;

    let newBody = body;
    for (const line of adds) {
        // 已有同 key 时先删除旧行，再在末尾追加（version 升级场景）
        const key = line.match(/^@([a-z]+)/i)[1];
        newBody = newBody.replace(new RegExp('\\n\\s*\\*\\s*@' + key + '\\s+[^\\n\\r]*', 'g'), '');
        newBody = newBody.replace(/\s*$/, `\n * ${line}\n `);
    }
    const newHeader = header[0].replace(header[1], newBody);
    const newCode = code.slice(0, header.index) + newHeader + code.slice(header.index + header[0].length);
    return { file: rel, code: newCode, adds };
}

const files = walk(PLUGIN_ROOT);
const changed = [];
for (const file of files) {
    const result = upgrade(file);
    if (result) changed.push(result);
}

console.log(`${APPLY ? '应用' : '预演'}：${changed.length}/${files.length} 个插件需要更新`);
for (const item of changed.slice(0, 30)) console.log(`- ${item.file}: ${item.adds.join(', ')}`);
if (changed.length > 30) console.log(`... 其余 ${changed.length - 30} 个`);

if (APPLY) {
    for (const item of changed) fs.writeFileSync(path.join(PLUGIN_ROOT, item.file), item.code);
    console.log('已写入。');
}
