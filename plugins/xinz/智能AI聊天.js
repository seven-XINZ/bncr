/** 
 * @author xinz
 * @name 智能AI聊天
 * @team xinz
 * @version 1.0.17
 * @description 通过API进行智能AI聊天，支持用户输入问题并将AI回复转换为语音
 * @rule ^聊天 (.+)$
 * @admin true
 * @public false
 * @priority 1
 * @disable false
 */

const axios = require('axios');

let activeUsers = {}; // 用于存储活跃用户的状态

module.exports = async (sender) => {
    const userId = sender.getUserId(); // 获取用户ID
    const userInput = sender.getMsg().trim(); // 获取用户输入
    const prompt = userInput.replace(/^聊天\s+/, ''); // 提取用户的提问内容

    // 检查用户输入是否为空
    if (!prompt) {
        await sender.reply('请提供提问内容。');
        return; // 继续等待用户输入
    }

    // 检查用户是否发送了退出命令
    if (prompt.toLowerCase() === 'q') {
        await sender.reply('对话已结束。如需再次聊天，请发送“聊天”。');
        delete activeUsers[userId]; // 删除用户状态
        return;
    }

    try {
        // 调用AI聊天API
        const response = await axios.get(`https://api.mhimg.cn/api/gpt_aojiaojj/?prompt=${encodeURIComponent(prompt)}`);
        
        // 获取AI回复
        const aiReply = response.data;

        // 调用语音合成API
        const voiceResponse = await axios.get(`https://api.mhimg.cn/api/lyy_yy/?word=${encodeURIComponent(aiReply)}`);
        
        // 检查语音合成结果
        if (voiceResponse.data && voiceResponse.data.url) {
            // 构造要发送的JSON对象
            const voiceData = {
                type: "record",
                data: {
                    file: "", // 根据需求填入文件信息
                    name: "AI语音回复", // 用户可以自定义名称
                    url: voiceResponse.data.url, // 语音文件的URL
                    path: "", // 如果有本地路径，可以填入
                    file_id: "", // 如果有文件ID，可以填入
                    file_size: "", // 如果有文件大小，可以填入
                    file_unique: "", // 如果有唯一标识，可以填入
                }
            };

            // 发送语音数据给用户
            await sender.reply(JSON.stringify(voiceData, null, 2)); // 格式化输出
        } else {
            await sender.reply(`AI回复：\n${aiReply}\n未获取到语音链接，请稍后再试。`);
        }
    } catch (error) {
        console.error('请求错误:', error); // 打印错误信息到控制台
        await sender.reply('请求失败，请稍后再试。可能是网络问题或服务端错误。');
    }
};
