/**
 *  @author xinz
 *  @name 智能AI聊天
 *  @team xinz
 *  @description 兼容 OpenAI 格式的聊天接口（豆包/DeepSeek/Ollama 均可），支持多轮上下文
 *  @rule ^聊天 (.+)$
 *  @rule ^聊天$ 
 *  @admin false
 *  @public false
 *  @priority 1
 *  @disable false
 * @version 2.0.0
 * @license MIT
 * @repo https://github.com/seven-XINZ/bncr
 * @platform qq tgBot wxClawBot wxQianxun wxXyo HumanTG web ssh
 * @updated 2026-11-28
 * @classification ["工具"]
 */
const axios = require('axios');

const jsonSchema = BncrCreateSchema.object({
    apiBase: BncrCreateSchema.string()
        .setTitle('接口地址')
        .setDescription('OpenAI 兼容的 base，例如 https://ark.cn-beijing.volces.com/api/v3')
        .setDefault('https://ark.cn-beijing.volces.com/api/v3'),
    apiKey: BncrCreateSchema.string()
        .setTitle('API Key')
        .setDescription('火山方舟填 sk- 开头的 Key；本地 Ollama 可留空')
        .setDefault(''),
    model: BncrCreateSchema.string()
        .setTitle('模型名')
        .setDescription('例如 doubao-seed-2-1-turbo、deepseek-chat、llama3')
        .setDefault('doubao-seed-2-1-turbo'),
    systemPrompt: BncrCreateSchema.string()
        .setTitle('系统提示词')
        .setDefault('你是群里的聊天助手，回答简短自然，不要用表情符号。'),
    historyRounds: BncrCreateSchema.number()
        .setTitle('上下文轮数')
        .setDescription('每个用户保留的历史对话轮数，0 表示不保留')
        .setDefault(6),
});
const ConfigDB = new BncrPluginConfig(jsonSchema);

const histories = new Map(); // userId -> [{role, content}]
const lastUse = new Map();

function pushHistory(userId, role, content, rounds) {
    if (!rounds) return;
    const list = histories.get(userId) || [];
    list.push({ role, content });
    while (list.length > rounds * 2) list.shift();
    histories.set(userId, list);
    lastUse.set(userId, Date.now());
    if (histories.size > 200) {
        const oldest = [...lastUse.entries()].sort((a, b) => a[1] - b[1])[0];
        if (oldest) {
            histories.delete(oldest[0]);
            lastUse.delete(oldest[0]);
        }
    }
}

module.exports = async sender => {
    await ConfigDB.get();
    const cfg = ConfigDB.userConfig || {};
    const apiBase = String(cfg.apiBase || 'https://ark.cn-beijing.volces.com/api/v3').replace(/\/+$/, '');
    const apiKey = String(cfg.apiKey || '').trim();
    const model = String(cfg.model || 'doubao-seed-2-1-turbo').trim();
    const rounds = Number(cfg.historyRounds == null ? 6 : cfg.historyRounds);

    const raw = String(sender.getMsg() || '').trim();
    const prompt = raw.replace(/^聊天\s*/, '').trim();
    if (!prompt) {
        return sender.reply('用法：聊天 你的问题\n清空上下文：聊天 清空');
    }
    if (prompt === '清空' || prompt.toLowerCase() === 'reset') {
        histories.delete(sender.getUserId());
        return sender.reply('上下文已清空');
    }
    if (!apiKey && !/localhost|127\.0\.0\.1|192\.168\./.test(apiBase)) {
        return sender.reply('未配置 API Key，请到插件配置里填写（火山方舟控制台可创建）。');
    }

    const userId = sender.getUserId();
    const messages = [{ role: 'system', content: cfg.systemPrompt || '你是群里的聊天助手，回答简短自然。' }];
    for (const h of histories.get(userId) || []) messages.push(h);
    messages.push({ role: 'user', content: prompt });

    try {
        const res = await axios.post(
            `${apiBase}/chat/completions`,
            { model, messages, temperature: 0.6 },
            {
                headers: {
                    'Content-Type': 'application/json',
                    ...(apiKey ? { Authorization: 'Bearer ' + apiKey } : {}),
                },
                timeout: 60000,
                validateStatus: s => s === 200,
            }
        );
        const answer = String((((res.data || {}).choices || [])[0] || {}).message?.content || '').trim();
        if (!answer) return sender.reply('接口没有返回内容，检查模型名是否正确。');
        pushHistory(userId, 'user', prompt, rounds);
        pushHistory(userId, 'assistant', answer, rounds);
        await sender.reply(answer);
    } catch (e) {
        const detail = e.response && e.response.data ? JSON.stringify(e.response.data).slice(0, 200) : e.message;
        console.warn('[智能AI聊天] 调用失败:', detail);
        await sender.reply('AI 调用失败：' + detail);
    }
};
