/**
 * @author xinz
 * @name 联系管理员助手
 * @team xinz
 * @description 允许用户向所有管理员发送消息。
 * @rule ^联系管理员$
 * @admin false
 * @public true
 * @priority 500
 * @classification ["工具"]
 * @disable false
 * @service false
 * @version 2.0.0
 * @license MIT
 * @repo https://github.com/seven-XINZ/bncr
 * @platform qq tgBot wxClawBot wxQianxun wxXyo HumanTG web ssh
 * @updated 2026-11-28
 */

// --- 引入/声明全局对象和依赖 ---
// 假设 sender, sysMethod 在全局可用

// --- 常量 ---
const DELETE_DELAY_MS = 60 * 1000; // 消息自动删除延迟 (60秒)
const WAIT_TIMEOUT_S = 60;       // 等待用户输入超时时间 (60秒)
const logPrefix = "[联系管理员]";

// --- 辅助函数：发送消息并设置定时删除 ---
async function replyAndDelete(sender, content, logPrefix = logPrefix) {
    const delayMs = DELETE_DELAY_MS;
    let messageId = null;
    try {
        const replyResult = await sender.reply(content);
        if (replyResult && typeof replyResult === 'string') messageId = replyResult;
        else if (replyResult?.message_id) messageId = replyResult.message_id;
        else if (replyResult?.id) messageId = replyResult.id;
        else if (replyResult?.data?.message_id) messageId = replyResult.data.message_id;

        if (messageId && delayMs > 0) {
            setTimeout(async () => { try { await sender.delMsg(messageId); } catch { /* 静默 */ } }, delayMs);
        } else if (!messageId) { console.warn(`${logPrefix} 发送消息后未能获取到可用的消息 ID。`); }
        return messageId;
    } catch (replyErr) { console.error(`${logPrefix} 发送消息时出错:`, replyErr); return null; }
}

// --- 插件主逻辑 ---
module.exports = async (sender) => {

    console.log(`${logPrefix} 收到命令，来自用户 ${sender.getUserId()}`);

    // --- 1. 检查 sysMethod.pushAdmin 是否可用 ---
    if (typeof sysMethod === 'undefined' || !sysMethod?.pushAdmin) {
        console.error(`${logPrefix} 错误：必要的 sysMethod.pushAdmin 方法不存在。`);
        await replyAndDelete(sender, '❌ 内部错误：管理员通知功能不可用。', logPrefix);
        return;
    }

    // --- 2. 提示用户输入内容 (使用新的提示语) ---
    const promptMsg = [
        "📮 管理联系通道已开启",
        "────────────────",
        "💌 请描述您的问题（建议包含：）",
        "   1. 问题发生的场景",
        "   2. 具体表现现象",
        "   3. 您的联系方式（可选）",
        "────────────────",
        `⏳ 您有 ${WAIT_TIMEOUT_S} 秒时间输入`, // 加入超时提示
        "🚪 输入 q 或 取消 可随时退出"
    ].join('\n');
    await replyAndDelete(sender, promptMsg, logPrefix); // 发送新的提示

    // --- 3. 等待用户输入 ---
    const userInputSender = await sender.waitInput(async (s) => {
        const input = s.getMsg()?.trim();
        // if (!input) { return await s.again("⚠️ 内容不能为空..."); } // 可选：强制非空
        const lowerInput = input?.toLowerCase();
        if (lowerInput === 'q' || lowerInput === '取消') { return; }
    }, WAIT_TIMEOUT_S);

    // --- 4. 处理输入结果 ---
    let userMessage = '';
    if (userInputSender === null) {
        await replyAndDelete(sender, "⏳ 操作超时，已取消发送。", logPrefix);
        console.log(`${logPrefix} 用户 ${sender.getUserId()} 输入超时。`);
        return;
    } else {
        userMessage = userInputSender.getMsg()?.trim();
        const userMessageId = userInputSender.getMsgId();
        if (userMessageId) { try { await sender.delMsg(userMessageId); } catch (delErr) { console.warn(`${logPrefix} 删除用户输入消息失败: ${delErr.message}`); } }
        const lowerUserMessage = userMessage?.toLowerCase();
        if (!userMessage || lowerUserMessage === 'q' || lowerUserMessage === '取消') {
            await replyAndDelete(sender, "👌 已取消发送。", logPrefix);
            console.log(`${logPrefix} 用户 ${sender.getUserId()} 取消发送。`);
            return;
        }
    }

    // --- 5. 构造发送给管理员的消息 ---
    try {
        const userId = sender.getUserId(); const userName = sender.getUserName() || userId;
        const platform = sender.getFrom() || '未知平台'; const groupId = sender.getGroupId();
        const groupName = sender.getGroupName();

        let adminMsg = `📨 来自用户的消息 [联系管理员]\n`; adminMsg += `────────────────────\n`;
        adminMsg += `▪️ 发送人: ${userName} (${userId})\n`; adminMsg += `▪️ 平 台: ${platform}\n`;
        if (groupId && groupId !== '0') { adminMsg += `▪️ 群 组: ${groupName || '未知群组'} (${groupId})\n`; }
        adminMsg += `▪️ 时 间: ${new Date().toLocaleString('zh-CN', { hour12: false })}\n`;
        adminMsg += `────────────────────\n`; adminMsg += `${userMessage}`;

        // --- 6. 推送给管理员 ---
        console.log(`${logPrefix} 准备推送消息给管理员。`);
        await sysMethod.pushAdmin({ platform: [], msg: adminMsg, type: 'text' });
        console.log(`${logPrefix} 消息已推送给管理员。`);

        // --- 7. 回复用户确认 ---
        await replyAndDelete(sender, "✅ 您的消息已成功发送给管理员。", logPrefix);

    } catch (error) {
        console.error(`${logPrefix} 处理或推送消息时出错:`, error);
        await replyAndDelete(sender, `❌ 发送消息时遇到错误: ${error.message}`, logPrefix);
    }

    console.log(`${logPrefix} 用户 ${sender.getUserId()} 的请求处理完毕。`);
};