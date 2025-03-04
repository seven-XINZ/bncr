/**
 * @author 咸鱼&xinz
 * @name 手动黑名单
 * @team xinz
 * @version v1.1.0
 * @description 用户黑白名单管理系统｜支持操作备注
 * @rule ^(拉黑|拉白) (\S+)$
 * @priority 10
 * @admin true
 * @disable false
 */

module.exports = async s => {
    const [command, target] = [s.param(1), s.param(2)];
    const platform = s.getFrom();
    const userKey = `${platform}:${target}`;
    
    // 初始化数据库连接
    const blacklistDB = new BncrDB('userBlacklist');
    const remarksDB = new BncrDB('userBlacklistRemarks');
    
    try {
        // 命令处理器
        const handlers = {
            '拉黑': async () => {
                await Promise.all([
                    blacklistDB.set(userKey, true),
                    remarksDB.set(userKey, '通过插件手动拉黑')
                ]);
                return `✅ 已封禁用户 [${target}]\n▸ 平台：${platform}\n▸ 备注：管理手动操作`;
            },
            
            '拉白': async () => {
                const results = await Promise.allSettled([
                    blacklistDB.del(userKey),
                    remarksDB.del(userKey)
                ]);
                const success = results.every(r => r.status === 'fulfilled');
                return success ? `✅ 已解封用户 [${target}]` : '⚠️ 部分数据清除失败';
            }
        };

        // 执行操作并获取结果
        const message = await handlers[command]();
        const reply = await s.reply([
            `🛡️ 用户状态变更通知`,
            `────────────────`,
            message,
            `────────────────`,
            `⏳ 本提示10秒后自动清除`
        ].join('\n'));

        // 自动清理消息
        setTimeout(() => s.delMsg(reply), 10 * 1000);

    } catch (error) {
        console.error('黑白名单操作失败:', error);
        const errorMsg = await s.reply([
            '⚠️ 操作执行异常',
            '────────────────',
            `错误类型：${error.name}`,
            `详细信息：${error.message}`
        ].join('\n'));
        setTimeout(() => s.delMsg(errorMsg), 10 * 1000);
    }
};
