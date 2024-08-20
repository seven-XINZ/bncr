/**
 * @author xinz&咸鱼
 * @name 通知管理员
 * @team xinz&咸鱼
 * @version v1.0.1
 * @description 处理用户联系请求并提供倒计时提示手动到web数据库删除屏蔽用户或者等待倒计时结束 数据库 contactmanagement
 * @rule ^(联系管理)$
 * @priority 10
 * @admin false
 * @disable false
 */
module.exports = async s => {
    const db = new BncrDB('contactmanagement');
    const id = s.getFrom() + ":" + s.getUserId();
    const currentDate = new Date();
    const futureDate = new Date(currentDate.getTime() + 24 * 60 * 60 * 1000);

    // 检查数据库中是否存在该用户的记录
    if (await db.get(id) == undefined) {
        // 如果不存在，初始化用户的记录为 0
        await db.set(id, "0");
    }

    // 获取上次提交的时间
    const lastContactTime = await db.get(id);
    
    // 检查当前时间是否大于等于用户上次提交的时间
    if (currentDate.getTime() >= lastContactTime) {
        // 如果可以提交信息，回复用户欢迎信息
        await s.reply("欢迎提问━(*｀∀´*)ノ亻! 请问是有什么问题吗 如果没事也可以调戏管理的哦 记得留下电子邮箱哦(发送'q'退出)");
        
        // 等待用户输入
        let userInput = await s.waitInput(async (s) => {
            // 获取用户发送的消息
            const message = s.getMsg();
            
            // 如果用户输入 'q'，则退出
            if (message === 'q') {
                await s.reply('已退出');
            } else {
                // 向管理员推送用户信息
                sysMethod.pushAdmin({
                    platform: [],
                    msg: `来自${s.getFrom()}平台${s.getGroupId()}群${s.getUserId()}用户的信息\n${message}`,
                });
                
                // 更新数据库，将用户的下一次提交时间设置为未来时间
                await db.set(id, futureDate.getTime());
                
                // 回复用户信息发送完成的消息
                const replyMessage = await s.reply("发送信息完成");
                
                // 删除回复消息，等待 10 秒后执行
                await s.delMsg(replyMessage, {
                    wait: 10
                });
            }
        }, 60); // 等待用户输入的最大时间为 60 秒

        // 如果用户输入超时，则回复超时信息
        if (userInput === null) return s.reply('超时退出');
    } else {
        // 计算距离下次联系的剩余时间
        const remainingTime = lastContactTime - currentDate.getTime();
        const remainingHours = Math.floor(remainingTime / (1000 * 60 * 60));
        const remainingMinutes = Math.floor((remainingTime % (1000 * 60 * 60)) / (1000 * 60));
        const remainingSeconds = Math.floor((remainingTime % (1000 * 60)) / 1000);
        
        // 提示用户还有多久可以再次联系管理
        const replyMessage = await s.reply(`别呼啦！别呼啦！您还有 ${remainingHours} 小时 ${remainingMinutes} 分钟 ${remainingSeconds} 秒才能再次联系管理。`);
        
        // 删除回复消息，等待 10 秒后执行
        await s.delMsg(replyMessage, {
            wait: 10
        });
    }
}
