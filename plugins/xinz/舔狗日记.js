/**
 * @author seven
 * @name 舔狗日记
 * @team xinz
 * @description 舔狗日记，天行 API 密钥在插件配置中填写
 * @rule ^(舔狗|舔狗日记|我舔)$
 * @admin false
 * @public true
 * @priority 9999
 * @disable false
 * @version 2.0.0
 * @license MIT
 * @repo https://github.com/seven-XINZ/bncr
 * @platform qq tgBot wxClawBot wxQianxun wxXyo HumanTG web ssh
 * @updated 2026-11-28
 * @classification ["工具"]
 */

const axios = require('axios');

/* 配置：天行 API 密钥由用户在面板填写，源码不留明文 */
const jsonSchema = BncrCreateSchema.object({
    tianapiKey: BncrCreateSchema.string()
        .setTitle('天行 API Key')
        .setDescription('天行数据（tianapi）舔狗日记接口的密钥')
        .setDefault('')
});

const ConfigDB = new BncrPluginConfig(jsonSchema);

module.exports = async s => {
    await ConfigDB.get();

    const tianapiKey = ConfigDB.userConfig.tianapiKey;
    if (!tianapiKey) {
        return await s.reply('请先在插件配置中填写天行 API Key。');
    }

    try {
        const res = await axios.post(
            'https://apis.tianapi.com/tiangou/index',
            new URLSearchParams({ key: tianapiKey })
        );
        const data = res.data;
        if (data && data.result && data.result.content) {
            await s.reply(data.result.content);
        } else {
            await s.reply('未获取到舔狗日记内容，请稍后再试。');
        }
    } catch (err) {
        console.error('舔狗日记获取失败:', err.message);
        await s.reply('获取舔狗日记失败，请稍后再试。');
    }
};
