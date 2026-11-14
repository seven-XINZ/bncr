/**
 * @author seven
 * @name 疯狂星期四
 * @team xinz
 * @version 1.1.0
 * @description 每周四定时推送疯狂星期四文案；推送平台与群号在插件配置中填写
 * @rule ^(疯狂星期四)$
 * @admin false
 * @public false
 * @priority 99999
 * @disable false
 * @cron 16 3 10 * * *
 */

const axios = require('axios');

/* 配置：推送列表，由用户在面板中填写，避免在源码中硬编码群号 */
const jsonSchema = BncrCreateSchema.object({
    pushList: BncrCreateSchema.array(BncrCreateSchema.object({
        platform: BncrCreateSchema.string().setTitle('平台').setDescription('如 qq、tgbot、HumanTG').setDefault('qq'),
        groupId: BncrCreateSchema.string().setTitle('群组 ID').setDescription('接收推送的群组 ID').setDefault('')
    })).setTitle('推送列表').setDescription('定时任务触发时推送到的平台与群组').setDefault([])
});

const ConfigDB = new BncrPluginConfig(jsonSchema);

module.exports = async s => {
    await ConfigDB.get();

    // 删除触发消息
    s.delMsg(s.getMsgId(), { wait: 1 });

    // 获取当前星期几（周日 0 ~ 周六 6，周四为 4），不再依赖第三方接口
    const weekDay = new Date().getDay();
    console.log('当前星期几:', weekDay);

    // 获取疯狂星期四的内容
    const url = "https://kfc-crazy-thursday.vercel.app/api/index";
    let result;

    try {
        const res = await axios.get(url);
        result = res.data;
    } catch (error) {
        console.error("获取疯狂星期四内容失败:", error);
        return s.reply("获取疯狂星期四内容失败，请稍后再试。");
    }

    console.log("疯狂星期四内容:", result);

    // 判断是否是定时任务
    if (s.getFrom() === "cron") {
        // 如果是定时任务，检查是否是星期四
        if (weekDay === 4) {
            const pushList = ConfigDB.userConfig.pushList || [];
            // 遍历推送列表并发送消息
            for (const { groupId, platform } of pushList) {
                if (!groupId) continue;
                sysMethod.push({
                    platform: platform,
                    groupId: groupId,
                    userId: [], // 如果需要，可以填入特定的用户ID
                    msg: result
                });
            }
        }
    } else {
        // 非定时任务，直接回复
        await s.reply(result);
    }
};
