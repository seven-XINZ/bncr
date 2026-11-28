/**
 * @author xinz
 * @name 自定义通知人
 * @team xinz
 * @description 允许用户通过命令向配置的指定用户发送消息。
 * @rule ^通知$
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

/*
 * 依赖说明: 无显式外部依赖 (依赖 Bncr 核心功能)
 * 配置说明: 请在 Bncr Web UI 的插件设置界面配置接收通知的用户列表 (格式: platform:userId)。
 */

// --- 引入/声明全局对象和依赖 ---
// 假设 sender, sysMethod, BncrCreateSchema, BncrPluginConfig 在全局可用

// --- 常量 ---
const DELETE_DELAY_MS = 60 * 1000;
const WAIT_TIMEOUT_S = 60;
const logPrefix = "[联系指定用户]";

// --- 插件设置界面 Schema 定义 ---
let jsonSchema = null;
let ConfigDB = null;

try {
    if (typeof BncrCreateSchema === 'undefined' || typeof BncrPluginConfig === 'undefined') {
        console.error(`${logPrefix} Bncr 环境缺少 BncrCreateSchema 或 BncrPluginConfig。`);
    } else {
        const BCS = BncrCreateSchema;
        jsonSchema = BCS.object({
            notifyTargets: BCS.array( BCS.string().setTitle('目标用户 (格式: platform:userId)').setDescription('例如: qq:12345678 或 tg:987654321') )
                .setTitle('接收通知的用户列表').setDescription('添加或编辑接收消息的用户。必须包含平台标识符和用户ID，用冒号分隔。').setDefault([]),
            waitTimeMinutes: BCS.number().setTitle('等待用户输入时间(分钟)').setDescription(`等待用户输入内容的超时时间，默认 ${Math.round(WAIT_TIMEOUT_S / 60)} 分钟`).setDefault(Math.round(WAIT_TIMEOUT_S / 60))
        });
        ConfigDB = new BncrPluginConfig(jsonSchema);
        console.log(`${logPrefix} 插件设置 Schema 和 ConfigDB 已初始化。`);
    }
} catch (schemaError) { console.error(`${logPrefix} 初始化 Schema 或 ConfigDB 时出错:`, schemaError); }

// --- 辅助函数：发送消息并设置定时删除 ---
async function replyAndDelete(sender, content, logPrefix = logPrefix) {
    const delayMs = DELETE_DELAY_MS; let messageId = null;
    try { const replyResult = await sender.reply(content); if (replyResult && typeof replyResult === 'string') messageId = replyResult; else if (replyResult?.message_id) messageId = replyResult.message_id; else if (replyResult?.id) messageId = replyResult.id; else if (replyResult?.data?.message_id) messageId = replyResult.data.message_id; if (messageId && delayMs > 0) { setTimeout(async () => { try { await sender.delMsg(messageId); } catch { /* 静默 */ } }, delayMs); } else if (!messageId) { console.warn(`${logPrefix} 发送消息后未能获取到可用的消息 ID。`); } return messageId; } catch (replyErr) { console.error(`${logPrefix} 发送消息时出错:`, replyErr); return null; }
}

// --- 插件主逻辑 ---
const main = async (sender) => {

    console.log(`${logPrefix} 收到命令，来自用户 ${sender.getUserId()}`);

    // --- 1. 检查核心功能和配置 ---
    if (typeof sysMethod === 'undefined' || !sysMethod?.push) { await replyAndDelete(sender, '❌ 内部错误：通知功能不可用。', logPrefix); return; }
    if (!ConfigDB) { await replyAndDelete(sender, '❌ 插件配置系统未初始化。', logPrefix); return; }

    // --- 2. 获取配置 ---
    let CDB = {}; let notifyTargetsRaw = []; let waitTimeMinutes = Math.round(WAIT_TIMEOUT_S / 60);
    let notifyTargets = []; // Initialize notifyTargets here

    try {
        await ConfigDB.get(); CDB = ConfigDB.userConfig || {};
        notifyTargetsRaw = CDB.notifyTargets || [];
        waitTimeMinutes = CDB.waitTimeMinutes || Math.round(WAIT_TIMEOUT_S / 60);

        notifyTargets = notifyTargetsRaw.map(target => String(target || '').trim()).filter(target => target.includes(':')).map(target => { const parts = target.split(':'); if (parts.length >= 2) { const platform = parts[0].trim(); const userId = parts.slice(1).join(':').trim(); if (platform && userId) return { platform, userId }; } console.warn(`${logPrefix} 配置中的目标格式无效，已忽略: "${target}"`); return null; }).filter(target => target !== null);

        if (notifyTargets.length === 0) { await replyAndDelete(sender, 'ℹ️ 管理员尚未配置接收消息的目标用户。', logPrefix); return; }
        console.log(`${logPrefix} 配置了 ${notifyTargets.length} 个通知目标。`);
    } catch (dbErr) { await replyAndDelete(sender, `❌ 获取插件配置失败: ${dbErr.message}`, logPrefix); return; }

    // --- 3. 提示用户输入内容 ---
    const waitTimeoutSeconds = waitTimeMinutes * 60;
    const promptMsg = [ "📮 联系通道已开启", "────────────────", "💬 请输入您想发送给指定联系人的内容:", "────────────────", `⏳ 您有 ${waitTimeoutSeconds} 秒时间输入`, "🚪 输入 q 或 取消 可随时退出" ].join('\n');
    await replyAndDelete(sender, promptMsg, logPrefix);

    // --- 4. 等待用户输入 ---
    const userInputSender = await sender.waitInput(async (s) => { const input = s.getMsg()?.trim(); const lowerInput = input?.toLowerCase(); if (lowerInput === 'q' || lowerInput === '取消') return; }, waitTimeoutSeconds);

    // --- 5. 处理输入结果 ---
    let userMessage = '';
    if (userInputSender === null) { await replyAndDelete(sender, "⏳ 操作超时，已取消发送。", logPrefix); console.log(`${logPrefix} 用户 ${sender.getUserId()} 输入超时。`); return; }
    else { userMessage = userInputSender.getMsg()?.trim(); const userMessageId = userInputSender.getMsgId(); if (userMessageId) { try { await sender.delMsg(userMessageId); } catch {} } const lowerUserMessage = userMessage?.toLowerCase(); if (!userMessage || lowerUserMessage === 'q' || lowerUserMessage === '取消') { await replyAndDelete(sender, "👌 已取消发送。", logPrefix); console.log(`${logPrefix} 用户 ${sender.getUserId()} 取消发送。`); return; } }

    // --- 6. 构造并发送给目标用户 ---
    try {
        const senderUserId = sender.getUserId(); const senderUserName = sender.getUserName() || senderUserId; const senderPlatform = sender.getFrom() || '未知平台'; const senderGroupId = sender.getGroupId(); const senderGroupName = sender.getGroupName();
        let notifyMsg = `📨 来自用户的消息 [联系通道]\n`; notifyMsg += `────────────────────\n`; notifyMsg += `▪️ 发送人: ${senderUserName} (${senderUserId})\n`; notifyMsg += `▪️ 平 台: ${senderPlatform}\n`; if (senderGroupId && senderGroupId !== '0') { notifyMsg += `▪️ 群 组: ${senderGroupName || '未知群组'} (${senderGroupId})\n`; } notifyMsg += `▪️ 时 间: ${new Date().toLocaleString('zh-CN', { hour12: false })}\n`; notifyMsg += `────────────────────\n`; notifyMsg += `${userMessage}`;
        console.log(`${logPrefix} 准备推送消息给 ${notifyTargets.length} 个目标用户...`);
        let pushSuccessCount = 0; let pushErrorCount = 0;
        for (const target of notifyTargets) { try { await sysMethod.push({ platform: target.platform, userId: target.userId, msg: notifyMsg, type: 'text' }); console.log(`${logPrefix} 成功推送到 ${target.platform}:${target.userId}`); pushSuccessCount++; } catch (pushErr) { console.error(`${logPrefix} 推送给 ${target.platform}:${target.userId} 失败:`, pushErr); pushErrorCount++; } }
        console.log(`${logPrefix} 推送完成: ${pushSuccessCount} 成功, ${pushErrorCount} 失败。`);
        if (pushSuccessCount > 0) { await replyAndDelete(sender, "✅ 您的消息已发送给指定联系人。", logPrefix); }
        else { await replyAndDelete(sender, "⚠️ 抱歉，未能成功发送消息。", logPrefix); }
    } catch (error) { console.error(`${logPrefix} 处理或推送消息时出错:`, error); await replyAndDelete(sender, `❌ 发送消息时遇到错误: ${error.message}`, logPrefix); }
    console.log(`${logPrefix} 用户 ${sender.getUserId()} 的请求处理完毕。`);
};

// --- 导出 ---
// *** Export the main function FIRST ***
module.exports = main;
