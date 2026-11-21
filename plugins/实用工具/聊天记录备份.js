/**
 * @author OpenClaw
 * @name 聊天记录备份
 * @team xinz
 * @origin 实用工具
 * @version 1.1.0
 * @description 将 BncrDB 数据导出为 JSON 文件，支持手动备份与定时备份
 * @platform tgBot qqBot wxKeAImao wxQianxun
 * @rule ^(备份记录 | 导出聊天 | 保存聊天)$
 * @rule ^(备份配置 | 备份设置)$
 * @admin true
 * @priority 100
 * @disable false
 * @public false
 * @cron 0 0 3 * * *
 */

const fs = require('fs').promises;
const path = require('path');

const jsonSchema = BncrCreateSchema.object({
    backupPath: BncrCreateSchema.string().setTitle('备份目录').setDescription('容器内可写目录').setDefault('/bncr/BncrData/backups'),
    keepDays: BncrCreateSchema.number().setTitle('保留天数').setDescription('0 表示不自动清理').setDefault(30),
});
const ConfigDB = new BncrPluginConfig(jsonSchema);

module.exports = async sender => {
    const cmd = sender.getMsg();
    if (cmd === '备份配置' && sender.getFrom() === 'system') {
        await performBackup(sender);
        return;
    }
    if (cmd.match(/^(备份记录 | 导出聊天 | 保存聊天)$/)) {
        await sender.reply('🔄 正在导出数据，请稍候...');
        await performBackup(sender);
        return;
    }
    if (cmd === '备份配置' || cmd === '备份设置') {
        await ConfigDB.get();
        const cfg = ConfigDB.userConfig || {};
        await sender.reply(`⚙️ 备份配置：\n• 备份目录：${cfg.backupPath || '/bncr/BncrData/backups'}\n• 保留天数：${cfg.keepDays ?? 30} 天\n• 定时任务：每天 03:00\n\n修改请到后台「插件配置编辑器」`);
        return;
    }
};

async function performBackup(sender) {
    await ConfigDB.get();
    const cfg = ConfigDB.userConfig || {};
    const backupDir = cfg.backupPath || '/bncr/BncrData/backups';
    const keepDays = Number(cfg.keepDays ?? 30);
    const db = new BncrDB('backup');
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(backupDir, `backup_${timestamp}.json`);

    try {
        await fs.mkdir(backupDir, { recursive: true });

        let forms = [];
        try { forms = await db.getAllForm(); } catch (e) { /* 兼容旧版 BncrDB */ }
        if (!Array.isArray(forms) || forms.length === 0) {
            const entries = await fs.readdir('/bncr/BncrData/db', { withFileTypes: true }).catch(() => []);
            forms = entries.filter(e => e.isDirectory()).map(e => e.name);
        }
        const backupData = {};
        for (const form of forms) {
            const formDb = new BncrDB(form);
            const keys = await formDb.keys();
            backupData[form] = {};
            for (const key of keys) {
                const item = await formDb.get(key, null, true);
                backupData[form][key] = item && typeof item === 'object' && 'value' in item ? item.value : item;
            }
        }

        await fs.writeFile(backupFile, JSON.stringify(backupData, null, 2), { mode: 0o600 });

        // 清理过期备份
        if (keepDays > 0) {
            const cutoff = Date.now() - keepDays * 86400000;
            for (const name of await fs.readdir(backupDir)) {
                if (!/^backup_.*\.json$/.test(name)) continue;
                const full = path.join(backupDir, name);
                const stat = await fs.stat(full);
                if (stat.mtimeMs < cutoff) await fs.unlink(full).catch(() => {});
            }
        }

        const stat = await fs.stat(backupFile);
        const records = await db.get('backup_history', []);
        records.unshift({ file: backupFile, time: now.toISOString(), size: stat.size, forms: forms.length });
        await db.set('backup_history', records.slice(0, 100));

        await sender.reply(`✅ 备份完成\n• 文件：${backupFile}\n• 数据表：${forms.length} 个\n• 大小：${(stat.size / 1024).toFixed(1)} KB\n• 时间：${now.toLocaleString()}`);
    } catch (error) {
        console.error('[聊天记录备份] 失败:', error);
        await sender.reply(`❌ 备份失败：${error.message}`);
    }
}
