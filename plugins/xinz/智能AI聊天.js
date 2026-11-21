/** 
 * @author xinz
 * @name 智能AI聊天
 * @team xinz
 * @version 1.0.18
 * @description 通过API进行智能AI聊天，支持用户输入问题并将AI回复转换为语音
 * @rule ^聊天 (.+)$
 * @admin true
 * @public false
 * @priority 1
 * @disable false
 */

const axios = require('axios');

const jsonSchema = BncrCreateSchema.object({
    chatApi: BncrCreateSchema.string().setTitle('聊天接口').setDefault('https://api.mhimg.cn/api/gpt_aojiaojj/'),
    ttsApi: BncrCreateSchema.string().setTitle('语音合成接口').setDescription('返回 JSON 且包含 url 字段').setDefault('https://api.mhimg.cn/api/lyy_yy/'),
});
const ConfigDB = new BncrPluginConfig(jsonSchema);

let activeUsers = {}; // 用于存储活跃用户的状态

module.exports = async (sender) => {
    await ConfigDB.get();
    const cfg = ConfigDB.userConfig || {};
    const chatApi = cfg.chatApi || 'https://api.mhimg.cn/api/gpt_aojiaojj/';
    const ttsApi = cfg.ttsApi || 'https://api.mhimg.cn/api/lyy_yy/';
    const userId = sender.getUserId(); // 获取用户ID
    const userInput = sender.getMsg().trim(); // 获取用户输入
    const prompt = userInput.replace(/^聊天\s+/, ''); // 提取用户的提问内容

    // 检查用户输入是否为空
    if (!prompt) {
        await sender.reply('请提供提问内容。');
        return; // 继续等待用户输入
    }

    // 检查用户是否发送了退出命令
    if (prompt.toLowerCase() === 'q') {
        await sender.reply('对话已结束。如需再次聊天，请发送“聊天”。');
        delete activeUsers[userId]; // 删除用户状态
        return;
    }

    try {
        // 调用AI聊天API
        const response = await axios.get(`${chatApi}?prompt=${encodeURIComponent(prompt)}`, { timeout: 15000 });
        
        // 获取AI回复
        const aiReply = response.data;

        // 调用语音合成API
        const voiceResponse = await axios.get(`${ttsApi}?word=${encodeURIComponent(aiReply)}`, { timeout: 15000 });
        
        // 检查语音合成结果
        if (voiceResponse.data && voiceResponse.data.url) {
            await sender.reply({ type: 'record', path: voiceResponse.data.url });
        } else {
            await sender.reply(`AI回复：\n${aiReply}\n未获取到语音链接，请稍后再试。`);
        }
    } catch (error) {
        console.error('请求错误:', error); // 打印错误信息到控制台
        await sender.reply('请求失败，请稍后再试。可能是网络问题或服务端错误。');
    }
};
