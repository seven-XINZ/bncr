/**
 *  @author seven
 *  @name 疯狂星期四
 *  @team xinz&咸鱼
 *  @version 1.0.0
 *  @description lsp
 *  @rule ^(疯狂星期四)$
 *  @admin false
 *  @public false
 *  @priority 99999
 *  @disable false
 *  @cron 16 3 10 * * *
 */

const axios = require('axios').default;

module.exports = async s => {
    // 定义推送列表，包含多个平台和QQ群号
    const PushList = [
        {
            groupId: '834396229',
            platform: 'qq'
        },
        {
            groupId: '671685583',
            platform: 'qq'
        },
        {
            groupId: '420035660',
            platform: 'qq'
        },
        {
            groupId: '960566450',
            platform: 'tgbot'
        },
        {
            groupId: '671685583',
            platform: 'HumanTG'
        }
        // 可以继续添加其他平台和群组
    ];

    // 删除触发消息
    s.delMsg(s.getMsgId(), { wait: 1 });

    // 获取当前日期的星期几
    const weekUrl = "https://www.mxnzp.com/api/holiday/single/20181121?ignoreHoliday=false&app_id=cwclhnmhw2vgojdo&app_secret=WkhnOXhKMlhOaFo5WndsNE5QUTRRdz09";
    let weekRes;

    try {
        weekRes = await axios.get(weekUrl);
    } catch (error) {
        console.error("获取星期几失败:", error);
        return s.reply("获取星期几失败，请稍后再试。");
    }

    const numMax = weekRes.data.data.weekDay;
    console.log("当前星期几:", numMax);

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
        if (numMax == "4") {
            // 遍历推送列表并发送消息
            for (const { groupId, platform } of PushList) {
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
