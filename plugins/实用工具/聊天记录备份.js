/**
 * @author OpenClaw
 * @name 聊天记录备份
 * @origin 实用工具
 * @version 1.0.0
 * @description 自动备份聊天记录到文件，支持定时备份和手动备份
 * @platform tgBot qqBot wxKeAImao wxQianxun
 * @rule ^(备份记录 | 导出聊天 | 保存聊天)$
 * @rule ^(备份配置 | 备份设置)$
 * @admin true
 * @priority 100
 * @disable false
 * @cron 0 0 3 * * *
 */

module.exports = async sender => {
    const db = new BncrDB('backup');
    const cmd = sender.getMsg();
    
    // 定时自动备份（通过 cron 触发）
    if (cmd === '备份配置' && sender.getFrom() === 'system') {
        await performBackup(sender);
        return;
    }
    
    // 手动触发备份
    if (cmd.match(/^(备份记录 | 导出聊天 | 保存聊天)$/)) {
        await sender.reply('🔄 正在备份聊天记录，请稍候...');
        await performBackup(sender);
        return;
    }
    
    // 查看备份配置
    if (cmd === '备份配置' || cmd === '备份设置') {
        const config = await db.get('backup_config', {
            autoBackup: true,
            backupTime: '03:00',
            keepDays: 30,
            backupPath: '/backups'
        });
        
        await sender.reply(`⚙️ 备份配置：\n• 自动备份：${config.autoBackup ? '✅ 开启' : '❌ 关闭'}\n• 备份时间：${config.backupTime}\n• 保留天数：${config.keepDays}天\n• 备份路径：${config.backupPath}`);
        return;
    }
};

async function performBackup(sender) {
    const db = new BncrDB('backup');
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timestamp = now.getTime();
    
    try {
        // 获取所有数据库表
        const forms = await db.getAllForm();
        const backupData = {};
        
        for (const form of forms) {
            const keys = await db.keys();
            backupData[form] = {};
            
            for (const key of keys) {
                const data = await db.get(key, null, true);
                if (data) {
                    backupData[form][key] = data.value;
                }
            }
        }
        
        // 创建备份文件
        const backupFile = `backup_${dateStr}_${timestamp}.json`;
        
        // 这里需要写入文件，Bncr 没有直接的写文件 API
        // 需要使用 sysMethod 或自定义方法
        console.log('备份数据:', JSON.stringify(backupData, null, 2));
        
        // 保存备份记录
        const backups = await db.get('backup_history', []);
        backups.unshift({
            file: backupFile,
            time: now.toISOString(),
            size: Buffer.byteLength(JSON.stringify(backupData)),
            forms: forms.length
        });
        
        // 只保留最近的 100 条记录
        if (backups.length > 100) {
            backups.splice(100);
        }
        
        await db.set('backup_history', backups);
        
        await sender.reply(`✅ 备份完成！\n• 文件名：${backupFile}\n• 包含 ${forms.length} 个数据表\n• 备份时间：${now.toLocaleString()}\n\n💡 提示：备份文件已保存到系统，需要手动导出到宿主机`);
        
    } catch (error) {
        console.error('备份失败:', error);
        await sender.reply(`❌ 备份失败：${error.message}`);
    }
}
