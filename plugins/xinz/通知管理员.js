/**作者
 * @author xinz&咸鱼
 * @name 联系管理
 * @team xinz&咸鱼
 * @version 1.0
 * @description 联系管理并转发消息
 * @rule ^(联系管理|洗白)$
 * @priority 10000
 * @admin false
 * @disable false
 */

// 创建一个系统数据库实例
const sysdb = new BncrDB('system');
const MAX_USAGE = 5; // 最大使用次数
const BLOCK_TIME = 86400; // 屏蔽时间（秒），1天

// 手动维护用户列表
const userListKey = 'user_list'; // 存储用户 ID 列表的键

module.exports = async s => {
    const userId = s.getUserId(); // 获取当前用户 ID
    const command = s.getMsg(); // 获取用户输入的命令
    const usageKey = `usage_${userId}`; // 用于存储使用次数的键
    const blockKey = `blocked_${userId}`; // 用于存储屏蔽状态的键

    // 处理“洗白”命令
    if (command === '洗白') {
        // 检查用户是否为管理员（假设有一个 isAdmin 方法）
        if (!s.isAdmin()) {
            return s.reply('您没有权限执行此命令。');
        }

        // 获取用户列表
        const userList = await sysdb.get(userListKey) || [];
        console.log("当前用户列表:", userList); // 调试信息

        for (const user of userList) {
            await sysdb.set(`blocked_${user}`, false); // 解除屏蔽
            await sysdb.set(`usage_${user}`, 0); // 重置使用次数
            console.log(`用户 ${user} 的限制已被移除`); // 调试信息
        }
        return s.reply('所有用户的限制已被移除。'); // 提示管理员移除成功
    }

    // 检查用户是否被屏蔽
    const isBlocked = await sysdb.get(blockKey);
    if (isBlocked) {
        return s.reply(`您已被屏蔽，请 ${BLOCK_TIME / 3600} 小时后再联系吧。`);
    }

    // 获取用户的使用次数
    let usageCount = await sysdb.get(usageKey) || 0;
    usageCount++;

    // 检查使用次数是否超过限制
    if (usageCount >= MAX_USAGE) {
        // 设置用户为屏蔽状态，并设置屏蔽时间
        await sysdb.set(blockKey, true); // 设置为屏蔽状态
        await sysdb.set(usageKey, usageCount); // 更新使用次数

        // 添加用户到用户列表（如果还未添加）
        let userList = await sysdb.get(userListKey) || [];
        if (!userList.includes(userId)) {
            userList.push(userId);
            await sysdb.set(userListKey, userList); // 更新用户列表
            console.log(`用户 ${userId} 已添加到用户列表`); // 调试信息
        }

        // 设置定时器，86400秒后解除屏蔽
        setTimeout(async () => {
            await sysdb.set(blockKey, false); // 解除屏蔽
            await sysdb.set(usageKey, 0); // 重置使用次数
            console.log(`用户 ${userId} 的屏蔽已解除`); // 调试信息
        }, BLOCK_TIME * 1000); // 转换为毫秒

        return s.reply(`您已达到最大使用次数，请 ${BLOCK_TIME / 3600} 小时后再联系吧。`);
    }

    // 更新使用次数
    await sysdb.set(usageKey, usageCount);
    console.log(`用户 ${userId} 的使用次数已更新为 ${usageCount}`); // 调试信息

    await s.reply("欢迎提问━(*｀∀´*)ノ亻! 请问是有什么问题吗？如果没事也可以调戏管理的哦，记得留下电子邮箱哦(发送'q'退出)");

    let YOU = await s.waitInput(async (s) => {
        let num = s.getMsg();
        if (num === 'q') {
            await s.reply('已退出联系管理。');
        } else {
            // 将用户信息与消息整合
            sysMethod.pushAdmin({
                platform: [], // 您可以在这里添加实际的平台信息
                msg: `来自 ${s.getFrom()} 平台 ${s.getGroupId()} 群 ${s.getUserId()} 用户的信息\n${num}`,
            });
            await s.reply("发送信息完成，感谢您的联系！");
        }
    }, 60); // 等待用户输入，超时时间为60秒

    // 检查是否超时
    if (YOU === null) {
        return s.reply('超时退出联系管理。');
    }
}
