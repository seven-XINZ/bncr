/**
 * @author seven (adapted by xinz for Dify)
 * @name dify
 * @team xinz
 * @description 通过 Dify API 进行聊天对话，可自定义参考用模型信息和系统提示。
 * @rule ^[aA] ([\s\S]+)$
 * @rule ^[aA]$
 * @admin false
 * @public true
 * @priority 99990
 * @classification ["AI"]
 * @disable false
 * @service false
 * @version 2.4.0
 * @license MIT
 * @repo https://github.com/seven-XINZ/bncr
 * @platform qq tgBot wxClawBot wxQianxun wxXyo HumanTG web ssh
 * @updated 2026-11-28
 */

/*
 * 依赖说明:
 * 1. node-fetch (v3+ is ESM)
 * 2. uuid (Optional)
 * !! 本插件不再自动安装依赖 !!
 * 请手动安装: npm install node-fetch uuid
 *
 * 配置说明:
 * 1. 在 Dify 应用中配置好模型、主要提示词等。
 * 2. 在 Bncr Web UI 插件设置中配置 Dify API 地址、密钥。
 * 3. 可选配置自定义系统提示词 (效果取决于Dify应用设置)。
 */

// --- 引入/声明全局对象和依赖 ---
let fetch, uuid;

// --- 常量 ---
const DELETE_DELAY_MS = 60 * 1000;
const logPrefix = "[Dify助手]";
const DEFAULT_TIMEOUTS = { request: 60, wait: 1 };
const DEFAULT_MODEL_INFO = "未指定 (使用 Dify 应用内配置)";
const DEFAULT_SYSTEM_PROMPT = ""; // Default to empty for custom prompt

// --- 插件设置界面 Schema 定义 ---
let jsonSchema = null;
let ConfigDB = null;
try {
    if (typeof BncrCreateSchema === 'undefined' || typeof BncrPluginConfig === 'undefined') {
        console.error(`${logPrefix} Bncr 环境缺少必要配置对象。`);
    } else {
        const BCS = BncrCreateSchema;
        jsonSchema = BCS.object({
            difyApiBaseUrl: BCS.string().setTitle('Dify API Base URL')
                .setDescription('必填 (例: https://api.dify.ai/v1 或自建实例地址)')
                .setDefault(''),
            difyApiKey: BCS.string().setTitle('Dify API Key')
                .setDescription('必填 (在 Dify 应用 -> 设置 -> API访问 -> API密钥 中获取)')
                .setDefault(''),
            // --- Added Custom System Prompt ---
            customSystemPrompt: BCS.string().setTitle('自定义系统提示 (可选)')
                .setDescription('输入自定义的系统提示词 (System Prompt)。注意：其效果取决于您 Dify 应用是否配置为接收并使用此输入变量 (通常在 "提示词编排 -> 变量" 中定义，变量名需精确匹配，如 `system_prompt`)。如果 Dify 应用未配置接收，此设置将被忽略。留空则不发送自定义提示。')
                .setDefault(DEFAULT_SYSTEM_PROMPT), // Default is empty
            // --- Informational Model/App Fields ---
            difyModelInfo: BCS.string().setTitle('模型信息 (参考用)')
                .setDescription('【仅供参考】填写此 API Key 对应 Dify 应用中主要使用的模型 (例如: Claude 3.5 Sonnet)，方便识别。不直接影响 API 调用。')
                .setDefault(DEFAULT_MODEL_INFO),
            difyAppId: BCS.string().setTitle('Dify App ID (可选)')
                .setDescription('【可选】填写对应的 Dify App ID，方便参考或未来扩展。')
                .setDefault(''),
            // --- ---
            timeoutSeconds: BCS.number().setTitle('API请求超时(秒)').setDefault(DEFAULT_TIMEOUTS.request),
            waitTimeMinutes: BCS.number().setTitle('等待用户输入时间(分钟)').setDefault(DEFAULT_TIMEOUTS.wait)
        });
        ConfigDB = new BncrPluginConfig(jsonSchema);
        console.log(`${logPrefix} 插件设置 Schema 和 ConfigDB 已初始化。`);
    }
} catch (schemaError) { console.error(`${logPrefix} 初始化 Schema 或 ConfigDB 时出错:`, schemaError); }

// --- 辅助函数：发送消息并设置定时删除 ---
async function replyAndDelete(sender, content, logPrefix = "[Dify助手]") {
    // ... (Function body unchanged) ...
    const delayMs = DELETE_DELAY_MS; let messageId = null; try { const replyResult = await sender.reply(content); if (replyResult && typeof replyResult === 'string') messageId = replyResult; else if (replyResult?.message_id) messageId = replyResult.message_id; else if (replyResult?.id) messageId = replyResult.id; else if (replyResult?.data?.message_id) messageId = replyResult.data.message_id; if (messageId && delayMs > 0) { setTimeout(async () => { try { await sender.delMsg(messageId); } catch (delErr) { /* 静默 */ } }, delayMs); } else if (!messageId) { console.warn(`${logPrefix} 发送消息后未能获取到可用的消息 ID。`); } return messageId; } catch (replyErr) { console.error(`${logPrefix} 发送消息时出错:`, replyErr); return null; }
}

// --- Dify API 调用函数 ---
// *** Modified: Added customSystemPrompt parameter ***
async function sendDifyMessage(apiUrl, apiKey, query, userId, conversationId = null, customSystemPrompt = null, timeoutMs = 60000) {
    const endpoint = `${apiUrl}/chat-messages`;
    const headers = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
    const body = {
        inputs: {}, // Initialize inputs object
        query: query,
        user: userId,
        response_mode: 'blocking',
        conversation_id: conversationId || undefined,
    };

    // *** Add custom system prompt to inputs if provided ***
    // Note: The key 'system_prompt' might need to match the variable name defined in your Dify App's prompt orchestration.
    if (customSystemPrompt && typeof customSystemPrompt === 'string' && customSystemPrompt.trim() !== '') {
        body.inputs['system_prompt'] = customSystemPrompt.trim(); // Use a common key, adjust if needed
        console.log(`${logPrefix} Sending custom system prompt.`);
    } else {
         console.log(`${logPrefix} No custom system prompt provided or is empty.`);
    }

    console.log(`${logPrefix} Calling Dify API for user: ${userId} convId: ${conversationId}`);
    // console.debug(`${logPrefix} Request Body:`, JSON.stringify(body)); // Uncomment for deep debugging

    try {
        const response = await fetch(endpoint, { method: 'POST', headers: headers, body: JSON.stringify(body), timeout: timeoutMs });
        // ... (Rest of the API call logic unchanged) ...
        if (!response.ok) { let eB = ''; try { eB = await response.text(); } catch {} console.error(`${logPrefix} Dify API Error (${response.status}):`, eB); throw new Error(`Dify API Error (${response.status})`); } const data = await response.json(); console.log(`${logPrefix} Dify API 响应成功`); if (!data || typeof data.answer !== 'string' || typeof data.conversation_id !== 'string') { console.error(`${logPrefix} Dify API 响应结构无效:`, data); throw new Error('Dify API 响应结构无效。'); } return { text: data.answer.trim(), conversationId: data.conversation_id, messageId: data.id };
    } catch (error) { console.error(`${logPrefix} 调用 Dify API 时出错 (${endpoint}):`, error); throw error; }
}

// --- 插件主逻辑 ---
const main = async (sender) => {

    // --- 1. 获取用户输入 ---
    const initialQuery = sender.param(1)?.trim() || '你好';
    console.log(`${logPrefix} 收到命令，初始查询: "${initialQuery}"`);

    // --- 2. 加载依赖 ---
    try {
        await sysMethod.testModule(['node-fetch', 'uuid'], { install: true });
        const fetchModule = await import('node-fetch'); fetch = fetchModule.default || fetchModule; if (typeof fetch !== 'function') throw new Error('无法加载 node-fetch。');
        // Optionally load uuid if needed
        // if (!sender.getUserId()) { uuid = require('uuid'); }
        console.log(`${logPrefix} 依赖加载成功。`);
    } catch (err) { /* ...错误处理 (提示用户手动安装)... */
        console.error(`${logPrefix} 加载依赖失败:`, err); let m = '未知'; let i = 'npm i <模块>'; if (err.code === 'MODULE_NOT_FOUND') { const ma = err.message.match(/Cannot find module '([^']+)'/); m = ma?.[1] || 'node-fetch/uuid'; i = `npm i ${m==='未知'?'node-fetch uuid':m}`; await replyAndDelete(sender, `❌ 缺依赖: ${m}\n请执行:\n\`${i}\``, logPrefix);} else { await replyAndDelete(sender, `❌ 加载依赖出错: ${err.message}`, logPrefix);} return;
    }

    // --- 3. 获取配置 ---
    let CDB = {}; let difyApiBaseUrl = ''; let difyApiKey = '';
    let requestTimeoutMs = (DEFAULT_TIMEOUTS.request || 60) * 1000;
    let waitTimeMinutes = DEFAULT_TIMEOUTS.wait || 1;
    let difyModelInfo = DEFAULT_MODEL_INFO; let difyAppId = '';
    let customSystemPrompt = DEFAULT_SYSTEM_PROMPT; // Get custom prompt from config

    if (!ConfigDB) { await replyAndDelete(sender, '❌ 插件配置系统未初始化。', logPrefix); return; }
    try {
        await ConfigDB.get(); CDB = ConfigDB.userConfig || {};
        difyApiBaseUrl = String(CDB.difyApiBaseUrl || '').trim().replace(/\/$/, '');
        difyApiKey = String(CDB.difyApiKey || '').trim();
        requestTimeoutMs = (CDB.timeoutSeconds || DEFAULT_TIMEOUTS.request) * 1000;
        waitTimeMinutes = CDB.waitTimeMinutes || DEFAULT_TIMEOUTS.wait;
        difyModelInfo = String(CDB.difyModelInfo || DEFAULT_MODEL_INFO).trim();
        difyAppId = String(CDB.difyAppId || '').trim();
        customSystemPrompt = String(CDB.customSystemPrompt || DEFAULT_SYSTEM_PROMPT).trim(); // Read custom prompt

        if (!difyApiBaseUrl || !difyApiKey) { await replyAndDelete(sender, 'ℹ️ 请先配置 Dify API Base URL 和 API Key。', logPrefix); return; }

        console.log(`${logPrefix} 使用 Dify API Base: ${difyApiBaseUrl}`);
        console.log(`${logPrefix} 参考模型信息: ${difyModelInfo}`);
        if (difyAppId) console.log(`${logPrefix} 参考 App ID: ${difyAppId}`);
        if (customSystemPrompt) console.log(`${logPrefix} 使用自定义系统提示。`);

    } catch (dbErr) { await replyAndDelete(sender, `❌ 获取插件配置失败: ${dbErr.message}`, logPrefix); return; }

    // --- 4. 获取用户标识 ---
    let userId = sender.getUserId() || '';
    if (!userId) { /* ...生成临时 UUID (逻辑不变)... */
        console.warn(`${logPrefix} 未能获取 sender 用户ID，生成临时 UUID。`); if (!uuid) { try { uuid = require('uuid'); } catch { await replyAndDelete(sender, '❌ 缺少 uuid 模块。请安装 `npm i uuid`。', logPrefix); return; } } userId = `temp-user-${uuid.v4()}`;
    } else { userId = String(userId); }
     console.log(`${logPrefix} 使用用户标识: ${userId}`);

    // --- 5. 开始对话循环 ---
    let conversationId = null; let currentQuery = initialQuery;
    while (true) {
        try {
            // *** Pass customSystemPrompt to API call ***
            const response = await sendDifyMessage(
                difyApiBaseUrl, difyApiKey, currentQuery, userId, conversationId,
                customSystemPrompt, // Pass the custom prompt read from config
                requestTimeoutMs
            );
            conversationId = response.conversationId;
            await replyAndDelete(sender, response.text, logPrefix);

            // Wait for next input
            const nextInputSender = await sender.waitInput(() => {}, waitTimeMinutes * 60);
            if (!nextInputSender) { await replyAndDelete(sender, "⏳ 对话超时，已结束。", logPrefix); break; }
            const nextInput = nextInputSender.getMsg()?.trim();
            const nextInputMsgId = nextInputSender.getMsgId();
            if(nextInputMsgId) await sender.delMsg(nextInputMsgId).catch(()=>{});
            if (!nextInput) continue;
            const lowerInput = nextInput.toLowerCase();
            if (lowerInput === 'q' || lowerInput === 'quit' || lowerInput === 'exit' || lowerInput === '退出') { await replyAndDelete(sender, "👋 对话已结束。", logPrefix); break; }
            currentQuery = nextInput;
            // No thinking message
        } catch (error) { console.error(`${logPrefix} 对话循环中出错:`, error); await replyAndDelete(sender, `❌ 请求处理失败: ${error.message}`, logPrefix); break; }
    }
    console.log(`${logPrefix} 对话循环结束 (用户: ${userId}, 会话: ${conversationId})。`);
};

// --- 导出 ---
module.exports = main;
