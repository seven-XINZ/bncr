/**
 * @author seven
 * @name ChatGPT
 * @team xinz
 * @version 1.0.5
 * @description ChatGpt聊天，适配无界3.0，增加画图功能
 * @rule ^(ai|画图) ([\s\S]+)$
 * @rule ^(ai|画图)$
 * @admin false
 * @public true
 * @priority 99999
 * @classification ["插件"]
 * @disable false
 */

const fs = require('fs'); // 文件系统模块，用于读取文件
const path = require('path'); // 路径模块，用于处理文件路径
const promptFilePath = './mod/prompts.json'; // prompts 文件路径
const fullPath = path.join(__dirname, promptFilePath); // 获取 prompts 文件的完整路径

// 检查 prompts.json 文件是否存在
if (!fs.existsSync(fullPath)) {
    console.error("错误: prompts.json 文件未找到:", fullPath);
}

let ConfigDB; // 定义全局变量用于存储配置数据库

// 定义配置获取函数
async function getConfig() {
    const BCS = BncrCreateSchema; // 创建插件界面
    const prompts = JSON.parse(fs.readFileSync(fullPath, 'utf-8')); // 从文件中读取 prompts

    // 生成 prompts 选项
    const promptOptions = prompts.map((prompt, index) => ({
        num: index, // 选项的索引
        name: prompt.act // 选项的名称
    }));

    // 定义可用的 GPT 模型选项
    const gptModels = [
        'web-gpt-3.5-turbo', 
        'web-gpt-4o-mini', 
        'gpt-3.5-turbo-16k', 
        'gpt-4', 
        'gpt-4-browsing', 
        'gpt-4-dalle', 
        'gpt-4-32k'
    ];

    // 定义 JSON Schema，用于配置项的定义
    const jsonSchema = BCS.object({
        apiBaseUrl: BCS.string().setTitle('ApiBaseUrl').setDescription('必填项，一般为"域名/v1"').setDefault(''), // API 基础 URL
        apiKey: BCS.string().setTitle('ApiKey').setDescription('必填项').setDefault(''), // API 密钥
        promptSel: BCS.number().setTitle('选择预设角色').setDescription('请根据需要选择').setEnum(promptOptions.map(opt => opt.num)).setEnumNames(promptOptions.map(opt => opt.name)).setDefault(0), // 选择预设角色
        gptModelSel: BCS.string().setTitle('选择GPT模型').setDescription('请根据需要选择').setEnum(gptModels).setDefault('web-gpt-4o-mini'), // 选择 GPT 模型
        imgEnabled: BCS.boolean().setTitle('启用画图功能').setDescription('开启后将使用画图功能').setDefault(false), // 画图开关
        imgBaseUrl: BCS.string().setTitle('画图的ApiBaseUrl').setDescription('启用画图功能必填，一般为"域名/v1"').setDefault(''), // 画图 API 基础 URL
        imgApiKey: BCS.string().setTitle('画图的ApiKey').setDescription('启用画图功能必填，根据自己的API支持情况填写').setDefault(''), // 画图 API 密钥
        imgModelSel: BCS.string().setTitle('选择画图模型').setDescription('请根据需要选择').setEnum(['midjourney', 'dall-e-2', 'dall-e-3']).setDefault('dall-e-3') // 选择画图模型
    });

    // 在确保路径和上下文准备好的情况下实例化 ConfigDB
    ConfigDB = new BncrPluginConfig(jsonSchema); // 创建配置数据库
    await ConfigDB.get(); // 获取配置
}

// 发送命令提示信息并在 5 秒后删除
async function sendCommandPrompt(sender, message) {
    const sentMessage = await sender.reply(message);
    const delMsgTime = 5000; // 5 秒
    const id = sentMessage.id; // 获取发送的消息 ID

    // 使用 setTimeout 在 5 秒后删除消息
    setTimeout(() => {
        sender.delMsg(id); // 使用 sender 删除回复的消息
    }, delMsgTime); // 使用设置的时间
}

module.exports = async (sender) => {
    try {
        // 确保所需的模块已安装
        await sysMethod.testModule(['got', 'chatgpt'], { install: true }); // 仅外部模块需要安装

        // 获取配置
        await getConfig();

        const CDB = ConfigDB.userConfig; // 获取用户配置
        if (!Object.keys(CDB).length) return await sender.reply('请先到WEB界面完成插件首次配置'); // 检查配置是否存在
        if (!CDB.apiBaseUrl) return sender.reply("未配置ApiBaseUrl"); // 检查 API 基础 URL
        if (!CDB.apiKey) return sender.reply("未配置ApiKey"); // 检查 API 密钥

        const apiKey = CDB.apiKey; // 获取 API 密钥
        const apiBaseUrl = CDB.apiBaseUrl; // 获取 API 基础 URL
        const promptSel = CDB.promptSel; // 获取用户选择的预设角色
        const gptModelSel = CDB.gptModelSel; // 获取用户选择的 GPT 模型
        const imgEnabled = CDB.imgEnabled; // 获取画图开关
        const imgBaseUrl = CDB.imgBaseUrl; // 获取画图 API 基础 URL
        const imgApiKey = CDB.imgApiKey; // 获取画图 API 密钥
        const imgModelSel = CDB.imgModelSel; // 获取用户选择的画图模型

        // 读取 prompts 文件
        let prompts = [];
        try {
            prompts = JSON.parse(fs.readFileSync(fullPath, 'utf-8')); // 从文件中读取 prompts
        } catch (error) {
            console.error("读取 prompts 文件时发生错误:", error);
            return await sender.reply("读取 prompts 文件时发生错误: " + error.message);
        }

        // 使用动态导入获取 ChatGPTAPI 和 got
        const { ChatGPTAPI } = await import('chatgpt'); // 导入 ChatGPT API
        const got = await import('got'); // 导入 got 库

        // 创建 ChatGPT API 实例
        let gptAPI = new ChatGPTAPI({
            apiKey: apiKey,
            apiBaseUrl: apiBaseUrl,
            completionParams: { model: gptModelSel }, // 设置使用的 GPT 模型
            debug: false
        });

        // 处理 'ai' 命令
        if (sender.param(1) === 'ai') {
            let prompt = prompts[promptSel].prompt; // 获取选定的预设 Prompt
            const promptMessage = `${prompt}，另外，输出字符限制，输出50-100字。`;
            await sendCommandPrompt(sender, `正在思考中，请稍后...`); // 发送思考中的提示
            let fistChat = sender.param(2) || '你好'; // 初始聊天内容
            
            let response = await gptAPI.sendMessage(fistChat, {
                systemMessage: promptMessage,
                timeoutMs: 3 * 10 * 1000 // 设置超时时间
            });
            await sender.reply(response.text); // 发送回复内容
        } else if (sender.param(1) === '画图') {
            // 处理 '画图' 命令
            if (!imgEnabled) return await sendCommandPrompt(sender, "未启用画图功能"); // 检查画图开关
            if (!imgBaseUrl) return await sendCommandPrompt(sender, "未配置画图ApiBaseUrl"); // 检查画图 API 基础 URL
            if (!imgApiKey) return await sendCommandPrompt(sender, "未配置画图ApiKey"); // 检查画图 API 密钥
            if (!imgModelSel) return await sendCommandPrompt(sender, "未配置画图模型"); // 检查画图模型
            
            await sendCommandPrompt(sender, '正在生成图像，请稍后'); // 提示生成图像
            try {
                const response = await got.default.post(`${imgBaseUrl}/images/generations`, {
                    json: {
                        model: imgModelSel, // 使用选择的画图模型
                        prompt: `画一幅图，${sender.param(2)}` // 使用用户提供的提示
                    },
                    headers: {
                        'Authorization': `Bearer ${imgApiKey}` // 使用 API 密钥进行身份验证
                    }
                });
                let data = JSON.parse(response.body).data; // 解析响应数据
                let dataUrl = data[0].url; // 获取图像 URL
                await sender.reply({ type: 'image', path: dataUrl }); // 发送生成的图像
            } catch (error) {
                await sendCommandPrompt(sender, '画图出现异常，请去控制台查看错误提示'); // 提示发生错误
                console.log(error); // 打印错误信息
                return; // 退出
            }
        }
    } catch (error) {
        console.error("模块检查或执行时发生错误:", error); // 打印错误信息
        await sender.reply("发生错误: " + error.message); // 发送用户友好的错误信息
    }
};

    }
};
