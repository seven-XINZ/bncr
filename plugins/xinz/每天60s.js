/**
 * @author seven
 * @name 每天60s
 * @team xinz
 * @version 1.1.0
 * @platform tgBot qq ssh HumanTG wxQianxun wxXyo wechaty
 * @description 60秒读懂世界（定时推送目标平台/群/用户在插件配置中填写）
 * @rule ^(60s|每日60)$
 * @admin false
 * @public true
 * @priority 99999
 * @disable false
 * @cron 0 10 9 * * *
 * @classification ["功能插件"]
 */

const axios = require('axios').default;

/* 配置：定时推送目标，源码不留群号/用户 id */
const jsonSchema = BncrCreateSchema.object({
    platform: BncrCreateSchema.string().setTitle('推送平台').setDescription('定时推送的平台，如 qq / tgBot').setDefault('qq'),
    groupId: BncrCreateSchema.string().setTitle('推送群 ID').setDescription('定时推送的群 ID，留空则不向群推送').setDefault(''),
    userId: BncrCreateSchema.string().setTitle('推送用户 ID').setDescription('定时推送的用户 ID，留空则不向用户推送').setDefault(''),
});
const ConfigDB = new BncrPluginConfig(jsonSchema);

async function displayDataWithIndex(data) {
    let result = '';
    (data || []).forEach((item, index) => {
        item = String(item).replace(/undefined/g, '');
        result += `${index + 1}. ${item}\n`;
    });
    return result;
}

module.exports = async s => {
    await ConfigDB.get();
    const { platform, groupId, userId } = ConfigDB.userConfig;

    let res;
    try {
        res = await axios.request({
            url: 'https://api.vvhan.com/api/60s',
            family: 4,
            method: 'get',
            json: true,
        });
    } catch (err) {
        console.error('60s 获取失败:', err.message);
        return await s.reply('获取 60 秒新闻失败，请稍后再试。');
    }

    const title = (res.data.title || '').replace(/在这里每天/g, '');
    const todaydate = res.data.time || '';
    const info = await displayDataWithIndex(res.data.data);
    const msg_60s = `【${todaydate}】${title}\n${info}`;

    if (s.getFrom() === 'cron') {
        if (!groupId && !userId) {
            return sysMethod.startOutLogs('60s 定时推送未配置群/用户，跳过。');
        }
        sysMethod.push({ platform, groupId, userId, msg: msg_60s });
    } else {
        await s.reply(msg_60s);
    }
};
