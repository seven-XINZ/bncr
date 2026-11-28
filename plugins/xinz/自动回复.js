/**
 * @author seven
 * @name 自动回复
 * @description 关键词自动回复：管理员可添加/删除关键词，发送「关键词菜单」查看关键词列表；关键词数据存于 mod/autoReplyData.json
 * @team xinz
 * @rule ^(删除自动回复) ([^\n]+)$
 * @rule ^(添加自动回复) ([^\n]+) ([\s\S]+)$
 * @rule ^(自动回复列表)$
 * @rule ^(关键词菜单)$
 * @rule [\s\S]+
 * @priority 1
 * @admin false
 * @disable false
 * @public false
 * @version 2.0.0
 * @license MIT
 * @repo https://github.com/seven-XINZ/bncr
 * @platform qq tgBot wxClawBot wxQianxun wxXyo HumanTG web ssh
 * @updated 2026-11-28
 * @classification ["工具"]
 */

const fs = require('fs');
const path = require('path');

const dataFilePath = path.join(__dirname, './mod/autoReplyData.json');

// 确保数据文件存在
if (!fs.existsSync(dataFilePath)) {
    fs.writeFileSync(dataFilePath, JSON.stringify({}));
}

const delMsgTime = 10000; // 自动回复消息定时删除（毫秒）

const loadAutoReplies = () => {
    try {
        return JSON.parse(fs.readFileSync(dataFilePath, 'utf-8'));
    } catch (err) {
        console.error('自动回复数据解析失败:', err.message);
        return {};
    }
};

const saveAutoReplies = data => {
    fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2));
};

/* main */
module.exports = async s => {
    const msgInfo = s.msgInfo;

    switch (s.param(1)) {
        case '添加自动回复': {
            if (!(await s.isAdmin())) return s.reply('您没有权限添加自动回复。');
            const addKeyword = s.param(2);
            const addReply = s.param(3);
            const autoReplies = loadAutoReplies();
            autoReplies[addKeyword] = {
                groupId: msgInfo.groupId || '非群组',
                from: msgInfo.from,
                reply: addReply,
            };
            saveAutoReplies(autoReplies);
            return s.delMsg(await s.reply('添加成功'), { wait: 10 });
        }

        case '自动回复列表': {
            const autoReplyList = loadAutoReplies();
            let logs = '';
            for (const key in autoReplyList) {
                const r = autoReplyList[key];
                logs += `${r.from}:${r.groupId} => ${key} | ${r.reply}\n`;
            }
            return s.delMsg(await s.reply(logs || '空列表'), { wait: 10 });
        }

        case '删除自动回复': {
            if (!(await s.isAdmin())) return s.reply('您没有权限删除自动回复。');
            const deleteKeyword = s.param(2);
            const currentReplies = loadAutoReplies();
            if (deleteKeyword in currentReplies) {
                delete currentReplies[deleteKeyword];
                saveAutoReplies(currentReplies);
                return s.delMsg(await s.reply(`已删除: ${deleteKeyword}`), { wait: 10 });
            }
            return s.delMsg(await s.reply('没有该关键词回复列表'), { wait: 10 });
        }

        case '关键词菜单': {
            const replyKeywords = loadAutoReplies();
            const keywordList = Object.keys(replyKeywords).map(key => `${key}`).join('\n');
            const menuMessage = ` ——功能列表——\n` +
                `——发送关键字——\n` +
                (keywordList || '当前没有自动回复关键词。\n') +
                `\n——作者 xinz——`;
            const replyId = await s.reply(menuMessage);
            setTimeout(() => s.delMsg(replyId), 20000);
            return;
        }
    }

    /* 关键词精确匹配回复 */
    const autoReplies = loadAutoReplies();
    const trimmed = (msgInfo.msg || '').trim();
    for (const key in autoReplies) {
        if (trimmed === key) {
            const id = await s.reply(autoReplies[key].reply);
            setTimeout(() => s.delMsg(id), delMsgTime);
        }
    }

    return 'next';
};
