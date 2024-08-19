/**
 * @author seven
 * @description 自动回复
 * @team xinz
 * @version v1.0.0
 * @name 自动回复 修改为菜单项的变更版本  可发送菜单指令 获取用户设置的关键词列表 仅管理员添加或删除关键词  
 关键词添加识别错误请到mod目录查看关键词信息自己更改
 * @rule ^(删除自动回复) ([^\n]+)$
 * @rule ^(添加自动回复) ([^\n]+) ([\s\S]+)$
 * @rule ^(自动回复列表)$
 * @rule ^(菜单)$
 * @rule [\s\S]+
 * @priority 1
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

const delMsgTime = 10000; // 设置删除消息的时间为 10000 毫秒

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

            for (const key in autoReplyList) {
                const r = autoReplyList[key];
                logs += `${r.from}:${r.groupId} => ${key} | ${r.reply}\n`;
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

        case '菜单': // 修改菜单命令
            const replyKeywords = loadAutoReplies();
            const keywordList = Object.keys(replyKeywords).map(key => `${key}`).join('\n');

            const menuMessage = ` ——功能列表——\n` +
                                `——发送关键字——\n` +
                (keywordList || '当前没有自动回复关键词。\n') +
                                `\n——作者 xinz——`;

            const replyId = await s.reply(menuMessage); // 发送菜单消息
            // 设置定时删除消息
            setTimeout(() => {
                s.delMsg(replyId); // 20秒后删除菜单消息
            }, 20000); // 20000毫秒 = 20秒

            return; // 结束处理

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
