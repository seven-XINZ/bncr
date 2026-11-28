/**
 * @author OpenClaw
 * @name 群数据统计
 * @team xinz
 * @origin 数据统计
 * @description 统计群聊数据：发言次数、活跃用户、消息时间分布等
 * @platform qqBot wxKeAImao wxQianxun
 * @rule ^(群统计 | 群数据 | 活跃排行)$
 * @rule ^(发言排行 | 话痨排行)$
 * @rule ^(活跃时间 | 聊天时间)$
 * @admin true
 * @priority 100
 * @disable false
 * @public false
 * @version 2.0.0
 * @license MIT
 * @repo https://github.com/seven-XINZ/bncr
 * @updated 2026-11-28
 * @classification ["数据"]
 */


const jsonSchema = BncrCreateSchema.object({
    topLimit: BncrCreateSchema.number().setTitle('排行榜人数').setDefault(10),
    barLength: BncrCreateSchema.number().setTitle('时段柱状长度').setDefault(20)
});
const ConfigDB = new BncrPluginConfig(jsonSchema);

module.exports = async sender => {
    await ConfigDB.get();
    const cfg = ConfigDB.userConfig || {};
    const topLimit = Number(cfg.topLimit) || 10;
    const barLength = Math.max(5, Number(cfg.barLength) || 20);
    const cmd = sender.getMsg();
    const groupId = sender.getGroupId();
    const db = new BncrDB('stats');
    
    if (!groupId) {
        await sender.reply('❌ 请在群聊中使用此命令');
        return;
    }
    
    // 群统计概览
    if (cmd === '群统计' || cmd === '群数据') {
        const stats = await db.get(`group_stats_${groupId}`, {
            totalMsgs: 0,
            uniqueUsers: 0,
            topUsers: [],
            hourlyDist: {},
            lastUpdate: null
        });
        
        await sender.reply(`📊 群聊数据统计\n\n` +
            `💬 总消息数：${stats.totalMsgs}\n` +
            `👥 活跃用户：${stats.uniqueUsers}人\n` +
            `🕐 最后更新：${stats.lastUpdate || '无数据'}\n\n` +
            `输入"发言排行"查看话痨榜\n` +
            `输入"活跃时间"查看聊天时段分布`);
        return;
    }
    
    // 发言排行
    if (cmd === '发言排行' || cmd === '话痨排行') {
        const stats = await db.get(`group_stats_${groupId}`);
        
        if (!stats || stats.topUsers.length === 0) {
            await sender.reply('📭 暂无发言统计数据\n需要开启消息统计功能');
            return;
        }
        
        let reply = '🏆 发言排行榜 🏆\n\n';
        stats.topUsers.slice(0, topLimit).forEach((user, index) => {
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
            reply += `${medal} ${user.name}: ${user.count}条消息\n`;
        });
        
        await sender.reply(reply);
        return;
    }
    
    // 活跃时间
    if (cmd === '活跃时间' || cmd === '聊天时间') {
        const stats = await db.get(`group_stats_${groupId}`);
        
        if (!stats || !stats.hourlyDist) {
            await sender.reply('📭 暂无时间分布数据');
            return;
        }
        
        const maxCount = Math.max(...Object.values(stats.hourlyDist));
        
        let reply = '📈 活跃时段分布\n\n';
        for (let hour = 0; hour < 24; hour++) {
            const count = stats.hourlyDist[hour] || 0;
            const barLength = Math.round((count / maxCount) * barLength);
            const bar = '█'.repeat(barLength);
            const timeStr = `${hour.toString().padStart(2, '0')}:00`;
            
            reply += `${timeStr} | ${bar} ${count}\n`;
        }
        
        await sender.reply(reply);
        return;
    }
};

// 消息统计监听器（需要在系统适配器中实现）
// 当收到消息时，自动统计
const messageStatsListener = async (sender) => {
    const groupId = sender.getGroupId();
    if (!groupId) return;
    
    const db = new BncrDB('stats');
    const userId = sender.getUserId();
    const userName = sender.getUserName();
    const hour = new Date().getHours();
    
    // 获取当前统计
    const stats = await db.get(`group_stats_${groupId}`, {
        totalMsgs: 0,
        uniqueUsers: 0,
        topUsers: [],
        hourlyDist: {},
        userCounts: {},
        lastUpdate: null
    });
    
    // 更新总消息数
    stats.totalMsgs = (stats.totalMsgs || 0) + 1;
    
    // 更新用户计数
    stats.userCounts = stats.userCounts || {};
    stats.userCounts[userId] = (stats.userCounts[userId] || 0) + 1;
    
    // 更新小时分布
    stats.hourlyDist = stats.hourlyDist || {};
    stats.hourlyDist[hour] = (stats.hourlyDist[hour] || 0) + 1;
    
    // 更新最后时间
    stats.lastUpdate = new Date().toLocaleString();
    
    // 重新计算 top users
    const userStats = Object.entries(stats.userCounts).map(([id, count]) => ({
        id,
        name: id, // 这里应该存储用户名
        count
    }));
    userStats.sort((a, b) => b.count - a.count);
    stats.topUsers = userStats.slice(0, 20);
    
    // 保存统计
    await db.set(`group_stats_${groupId}`, stats);
};
