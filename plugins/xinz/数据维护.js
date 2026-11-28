/**
 * @author xinz
 * @name 数据维护
 * @team xinz
 * @version 1.0.0
 * @description 插件数据备份/恢复、插件健康检查、依赖图与数据占用
 * @platform qq tgBot wxClawBot wxQianxun wxXyo HumanTG web ssh
 * @rule ^维护$
 * @rule ^备份$
 * @rule ^备份\s+列表$
 * @rule ^备份\s+恢复\s+(\S+)$
 * @rule ^插件健康$
 * @rule ^依赖图$
 * @rule ^数据$
 * @admin true
 * @public true
 * @priority 1000000
 * @disable false
 * @cron 0 0 3 * * 0
 * @classification ["运维"]
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const link = require('./mod/link');

const DATA_DIR = path.join(__dirname, 'mod', 'data');
const BACKUP_DIR = path.join(__dirname, 'mod', 'backups');
const jsonSchema = BncrCreateSchema.object({
    backupDir: BncrCreateSchema.string().setTitle('备份目录').setDescription('留空用 plugins/xinz/mod/backups').setDefault(''),
    keep: BncrCreateSchema.number().setTitle('保留备份个数').setDefault(10),
});
const ConfigDB = new BncrPluginConfig(jsonSchema);

link.register({
    name: '数据维护',
    description: '数据备份/恢复、健康检查、依赖图',
    events: ['maintenance'],
    commands: ['维护', '备份', '备份 列表', '备份 恢复 文件名', '插件健康', '依赖图', '数据'],
});

function run(cmd, args, timeout = 30000) {
    return new Promise(resolve => {
        execFile(cmd, args, { timeout, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
            resolve({ code: err ? (err.code || 1) : 0, stdout: String(stdout || ''), stderr: String(stderr || ''), error: err ? err.message : '' });
        });
    });
}
function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
function backupDir(cfg) {
    return cfg.backupDir ? path.resolve(String(cfg.backupDir)) : BACKUP_DIR;
}
function stamp() {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;
}
function size(n) {
    const b = Number(n) || 0;
    return b > 1024 * 1024 ? (b / 1024 / 1024).toFixed(1) + ' MB' : b > 1024 ? (b / 1024).toFixed(1) + ' KB' : b + ' B';
}
async function backupNow(cfg, prefix = 'data') {
    const dir = backupDir(cfg);
    ensureDir(dir);
    const name = `${prefix}-${stamp()}.tar.gz`;
    const dest = path.join(dir, name);
    const r = await run('tar', ['-czf', dest, '-C', DATA_DIR, '.'], 60000);
    if (r.code !== 0) throw new Error(r.error || r.stderr || 'tar 失败');
    const keep = Math.max(1, Number(cfg.keep) || 10);
    const files = listBackups(cfg).filter(x => x.startsWith(prefix + '-'));
    while (files.length > keep) {
        const old = files.shift();
        try {
            fs.unlinkSync(path.join(dir, old));
        } catch (e) {}
    }
    return { name, dest, size: fs.statSync(dest).size };
}
function listBackups(cfg) {
    const dir = backupDir(cfg);
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter(x => x.endsWith('.tar.gz')).sort().reverse();
}
async function checkHealth() {
    const plugins = link.list().filter(x => x.kind === 'plugin');
    const bad = [];
    const ok = [];
    for (const p of plugins) {
        const r = await run(process.execPath, ['--check', p.abs], 10000);
        if (r.code === 0) ok.push(p);
        else bad.push({ name: p.name, file: p.file, error: r.stderr.trim().split('\n').slice(-1)[0] || r.error });
    }
    return { total: plugins.length, ok: ok.length, bad };
}
function dependencyGraph() {
    const plugins = link.list().filter(x => x.kind === 'plugin');
    const edges = [];
    for (const p of plugins) {
        let code = '';
        try {
            code = fs.readFileSync(p.abs, 'utf8');
        } catch (e) {}
        const deps = [...code.matchAll(/require\(['"](.+?)['"]\)/g)].map(m => m[1]).filter(x => x.startsWith('./') || x.startsWith('../'));
        for (const dep of [...new Set(deps)]) edges.push(`${p.name} → ${dep}`);
    }
    return edges;
}
function dataStats() {
    if (!fs.existsSync(DATA_DIR)) return [];
    return fs.readdirSync(DATA_DIR).filter(x => x.endsWith('.json')).map(f => {
        const st = fs.statSync(path.join(DATA_DIR, f));
        return { file: f, size: st.size };
    }).sort((a, b) => b.size - a.size);
}
function summaryText(cfg, health, data) {
    const backups = listBackups(cfg);
    const plugins = link.list().filter(x => x.kind === 'plugin');
    return [
        '🛠️ 数据维护',
        `插件：${plugins.length} 个，语法健康 ${health.ok}/${health.total}`,
        `数据文件：${data.length} 个，合计 ${size(data.reduce((n, x) => n + x.size, 0))}`,
        `备份：${backups.length} 个，目录 ${backupDir(cfg)}`,
        backups[0] ? `最近备份：${backups[0]}` : '还没有备份',
        '',
        '备份 / 备份 列表 / 备份 恢复 文件名 / 插件健康 / 依赖图',
    ].join('\n');
}

module.exports = async s => {
    const raw = String(s.getMsg() || '').trim();
    const isCron = typeof s.getFrom === 'function' && s.getFrom() === 'cron';
    await ConfigDB.get();
    const cfg = ConfigDB.userConfig || {};
    if (isCron) {
        try {
            const b = await backupNow(cfg, 'auto');
            console.info('[数据维护] 自动备份:', b.name, b.size);
        } catch (e) {
            console.error('[数据维护] 自动备份失败:', e.message);
        }
        return;
    }
    if (raw === '维护') {
        const health = await checkHealth();
        return s.reply(summaryText(cfg, health, dataStats()));
    }
    if (raw === '备份') {
        try {
            const b = await backupNow(cfg, 'data');
            return s.reply(`📦 已备份\n${b.name}\n${size(b.size)}\n目录：${backupDir(cfg)}`);
        } catch (e) {
            return s.reply('备份失败：' + e.message);
        }
    }
    if (raw === '备份 列表' || raw === '备份列表') {
        const files = listBackups(cfg);
        return s.reply('📦 备份列表\n' + (files.length ? files.map((x, i) => `${i + 1}. ${x} · ${size(fs.statSync(path.join(backupDir(cfg), x)).size)}`).join('\n') : '暂无备份'));
    }
    let m = raw.match(/^备份\s+恢复\s+(\S+)$/);
    if (m) {
        if (!/^[\w.-]+\.tar\.gz$/.test(m[1])) return s.reply('备份文件名不合法');
        const dir = backupDir(cfg);
        const file = path.join(dir, m[1]);
        if (!fs.existsSync(file)) return s.reply('备份不存在：' + m[1]);
        try {
            await backupNow(cfg, 'pre-restore');
            const r = await run('tar', ['-xzf', file, '-C', DATA_DIR], 60000);
            if (r.code !== 0) throw new Error(r.error || r.stderr || '解压失败');
            return s.reply(`♻️ 已恢复 ${m[1]}\n恢复前数据已另存为 pre-restore-*.tar.gz`);
        } catch (e) {
            return s.reply('恢复失败：' + e.message);
        }
    }
    if (raw === '插件健康') {
        const h = await checkHealth();
        return s.reply(`🩺 插件健康\n共 ${h.total} 个，正常 ${h.ok}\n` + (h.bad.length ? '异常：\n' + h.bad.map(x => `· ${x.name}（${x.file}）：${x.error}`).join('\n') : '全部通过语法检查'));
    }
    if (raw === '依赖图') {
        const edges = dependencyGraph();
        return s.reply('🕸️ 依赖图\n' + (edges.length ? edges.join('\n') : '没有内部依赖'));
    }
    if (raw === '数据') {
        const data = dataStats();
        return s.reply('💾 数据占用\n' + (data.length ? data.map(x => `${x.file}：${size(x.size)}`).join('\n') : '暂无数据') + `\n\n目录：${DATA_DIR}`);
    }
    return s.reply(summaryText(cfg, await checkHealth(), dataStats()));
};
