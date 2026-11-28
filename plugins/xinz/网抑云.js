/**
 * @author Dswang
 * @team xinz
 * @name 网抑云
 * @description 网抑云插件
 * @rule ^网抑云$
 * @admin false
 * @public false
 * @priority 1
 * @disable false
 * @version 2.0.0
 * @license MIT
 * @repo https://github.com/seven-XINZ/bncr
 * @platform qq tgBot wxClawBot wxQianxun wxXyo HumanTG web ssh
 * @updated 2026-11-28
 * @classification ["工具"]
 */
const axios = require('axios');

const jsonSchema = BncrCreateSchema.object({
    apiUrl: BncrCreateSchema.string().setTitle('接口地址').setDefault('https://api.uomg.com/api/comments.163?format=text'),
});
const ConfigDB = new BncrPluginConfig(jsonSchema);

module.exports = async s => {
    await ConfigDB.get();
    const apiUrl = (ConfigDB.userConfig && ConfigDB.userConfig.apiUrl) || 'https://api.uomg.com/api/comments.163?format=text';
    // 规则：^网抑云$
    // 当用户发送 "网抑云" 时，触发此插件

    try {
        // 发送 GET 请求到 API
        const response = await axios.get(apiUrl, { timeout: 10000 });

        // 获取返回的文本
        const text = response.data;

        // 回复触发此消息的用户
        await s.reply(text);
    } catch (error) {
        // 如果请求失败，回复错误信息
        await s.reply('抱歉，获取网抑云信息失败，请稍后再试。');
    }
};