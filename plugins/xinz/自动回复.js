/**
 * @author seven
 * @description 自动回复
 * @team xinz
 * @version v1.0.0
 * @name 自动回复
 * @rule ^(删除自动回复) ([^\n]+)$
 * @rule ^(添加自动回复) ([^\n]+) ([\s\S]+)$
 * @rule ^(自动回复列表)$
 * @rule [\s\S]+
 * @priority 1
 * @public true
 * @admin false
 * @disable false
 */

const fs = require('fs');
const path = require('path');

const dataFilePath = path.join(__dirname, './mod/autoReplyData.json');

// 确保数据文件存在
if (!fs.existsSync(dataFilePath)) {
    fs.writeFileSync(dataFilePath, JSON.stringify({}));
}

const delMsgTime = 5000; // 设置删除消息的时间为 5000 毫秒

/* main */
module.exports = async s => {
    const msgInfo = s.msgInfo;

    // 从文件中读取自动回复数据
    const loadAutoReplies = () => JSON.parse(fs.readFileSync(dataFilePath));

    switch (s.param(1)) {
        case '添加自动回复':
            if (!(await s.isAdmin())) return s.reply('您没有权限添加自动回复。'); // 仅管理员可以添加
            const addKeyword = s.param(2);
            const addReply = s.param(3);
            const autoReplies = loadAutoReplies();

            autoReplies[addKeyword] = {
                groupId: msgInfo.groupId || '非群组', // 记录群组ID或标记为非群组
                from: msgInfo.from,
                reply: addReply,
            };

            fs.writeFileSync(dataFilePath, JSON.stringify(autoReplies, null, 2));
            return s.delMsg(await s.reply('添加成功'), { wait: 10 });

        case '自动回复列表':
            const autoReplyList = loadAutoReplies();
            let logs = '';

            let i = 1;
            for (const key in autoReplyList) {
                const r = autoReplyList[key];
                logs += `${i}. ${r.from}:${r.groupId} => ${key} | ${r.reply}\n`;
                i++;
            }
            return s.delMsg(await s.reply(logs || '空列表'), { wait: 10 });

        case '删除自动回复':
            if (!(await s.isAdmin())) return s.reply('您没有权限删除自动回复。'); // 仅管理员可以删除
            const deleteKeyword = s.param(2);
            const currentReplies = loadAutoReplies();

            if (deleteKeyword in currentReplies) {
                delete currentReplies[deleteKeyword];
                fs.writeFileSync(dataFilePath, JSON.stringify(currentReplies, null, 2));
                return s.delMsg(await s.reply(`已删除: ${deleteKeyword}`), { wait: 10 });
            } else {
                return s.delMsg(await s.reply('没有该关键词回复列表'), { wait: 10 });
            }
    }

    /* 异步处理 */
    new Promise(async resolve => {
        const autoReplies = loadAutoReplies(); // 重新加载自动回复数据
        for (const key in autoReplies) {
            const r = autoReplies[key];
            if (msgInfo.msg.trim() === key) { // 精确关键词匹配
                const id = await s.reply(r.reply); // 发送回复
                // 设置删除回复消息的延迟
                setTimeout(() => {
                    s.delMsg(id); // 删除回复的消息
                }, delMsgTime); // 使用设置的时间
            }
        }
        resolve(void 0);
    });

    return 'next';
};
