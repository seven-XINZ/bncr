/**
 * @author xinz&咸鱼
 * @name 管理员联系助手
 * @team xinz&咸鱼
 * @version v1.1.0
 * @description 智能联系通道｜24小时冷却提醒｜消息直达管理
 * @rule ^(联系管理)$
 * @priority 10
 * @admin false
 * @disable false
 */

module.exports = async s => {
    const db = new BncrDB('contactmanagement');
    const userKey = `${s.getFrom()}:${s.getUserId()}`;
    const now = Date.now();
    const cooldown = 24 * 60 * 60 * 1000; // 24小时冷却

    try {
        // 初始化/获取用户状态
        const lastContact = (await db.get(userKey)) || 0;
        const remainTime = lastContact + cooldown - now;

        // 冷却期验证
        if (remainTime > 0) {
            const { hours, minutes } = formatTime(remainTime);
            const reply = await s.reply([
                `⏳ 冷却中请稍候...`,
                `▸ 剩余时间：${hours}小时${minutes}分钟`,
                `✨ 温馨提示：请勿重复提交相同问题`
            ].join('\n'));
            
            return setTimeout(() => s.delMsg(reply), 10 * 1000);
        }

        // 开启对话流程
        const dialog = await s.reply([
            "📮 管理联系通道已开启",
            "────────────────",
            "💌 请描述您的问题（建议包含：）",
            "1. 问题发生的场景",
            "2. 具体表现现象",
            "3. 您的联系方式（可选）",
            "────────────────",
            "🚪 输入 q 可随时退出本流程"
        ].join('\n'));

        // 等待用户输入
        const input = await s.waitInput(async (s) => {
            const msg = s.getMsg().trim();
            
            if (msg === 'q') {
                await s.reply('✅ 已退出联系通道');
                return db.set(userKey, now + cooldown); // 防止滥用
            }

            if (msg.length < 5) {
                await s.reply('⚠️ 内容过短，请详细描述您的问题');
                return false; // 重新等待输入
            }

            // 推送管理通知
            sysMethod.pushAdmin({
                platform: s.getFrom(),
                msg: `📥 新用户消息通知\n──────────────\n平台：${s.getFrom()}\n用户：${s.getUserId()}\n内容：\n${msg}`
            });

            // 更新联系时间
            await db.set(userKey, now);
            
            // 用户反馈
            const confirm = await s.reply([
                "✅ 消息已直达管理团队",
                "────────────────",
                "▸ 我们将在24小时内回复",
                "▸ 请留意您的邮箱/消息",
                "────────────────",
                "⏳ 本提示10秒后自动清除"
            ].join('\n'));
            
            setTimeout(() => s.delMsg(confirm), 10 * 1000);
        }, 120 * 1000); // 2分钟超时

        // 清理初始提示
        s.delMsg(dialog);

    } catch (e) {
        console.error('联系流程异常:', e);
        s.reply('⚠️ 服务暂时不可用，请稍后重试');
    }
};

// 时间格式化工具
function formatTime(ms) {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    return { hours, minutes };
}
