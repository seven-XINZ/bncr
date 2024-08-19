
/**
 * @author seven
 * @name ChatGPT
 * @team xinz
 * @version 1.0.5
 * @description ChatGpt聊天，适配无界3.0，删除了tts避免部分不支持tts 修复对话只能独立对话 
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
const BCS = BncrCreateSchema; // 创建插件界面

// 生成 prompts 选项
let prompts = [];
try {
    prompts = JSON.parse(fs.readFileSync(fullPath, 'utf-8')); // 从文件中读取 prompts
} catch (error) {
    console.error("读取 prompts 文件时发生错误:", error);
}

// 生成 prompts 选项
const promptOptions = prompts.map((prompt, index) => ({
    num: index,
    name: prompt.act
}));

// 定义模型选项
const modes = ['web-gpt-3.5-turbo', 'web-gpt-4o-mini', 'gpt-3.5-turbo-16k', 'gpt-4', 'gpt-4-browsing', 'gpt-4-dalle', 'gpt-4-32k', 'midjourney', 'dall-e-2', 'dall-e-3'];

// 插件界面
const jsonSchema = BCS.object({
    apiBaseUrl: BCS.string().setTitle('ApiBaseUrl').setDescription('必填项，一般为"域名/v1"').setDefault(''), // API 基础 URL
    apiKey: BCS.string().setTitle('ApiKey').setDescription('必填项').setDefault(''), // API 密钥
    isEdit: BCS.boolean().setTitle('HumanTG是否开启编辑模式').setDescription('关闭则逐条回复，不编辑消息').setDefault(false), // 编辑模式开关
    promptSel: BCS.number().setTitle('选择预设角色').setDescription('请根据需要选择').setEnum(promptOptions.map(opt => opt.num)).setEnumNames(promptOptions.map(opt => opt.name)).setDefault(0), // 选择预设角色
    modeSel: BCS.string().setTitle('选择GPT模型').setDescription('请根据需要选择').setEnum(modes).setDefault('gpt-3.5-turbo'), // 选择 GPT 模型
    promptDiy: BCS.string().setTitle('请输入自定义Prompt').setDescription('输入自定义Prompt会使预设角色失效').setDefault(''), // 自定义 Prompt
    imgEnabled: BCS.boolean().setTitle('启用画图功能').setDescription('开启后将使用画图功能').setDefault(false), // 画图开关
    imgBaseUrl: BCS.string().setTitle('画图的ApiBaseUrl').setDescription('启用画图功能必填，一般为"域名/v1"').setDefault(''), // 画图 API 基础 URL
    imgMode: BCS.string().setTitle('画图的模型').setDescription('启用画图功能必填，根据自己的API支持情况填写').setDefault(''), // 画图模型
    imgApiKey: BCS.string().setTitle('画图的ApiKey').setDescription('启用画图功能必填，根据自己的API支持情况填写').setDefault('') // 画图 API 密钥
});

// 创建配置数据库
const ConfigDB = new BncrPluginConfig(jsonSchema); // 创建配置数据库

module.exports = async (sender) => {
    try {
        // 确保所需的模块已安装
        await sysMethod.testModule(['got', 'chatgpt'], { install: true }); // 仅外部模块需要安装

        await ConfigDB.get(); // 获取配置
        const CDB = ConfigDB.userConfig; // 获取用户配置
        if (!Object.keys(CDB).length) return await sender.reply('请先到WEB界面完成插件首次配置'); // 检查配置是否存在
        if (!CDB.apiBaseUrl) return sender.reply("未配置ApiBaseUrl"); // 检查 API 基础 URL
        if (!CDB.apiKey) return sender.reply("未配置ApiKey"); // 检查 API 密钥

        const apiKey = CDB.apiKey; // 获取 API 密钥
        const apiBaseUrl = CDB.apiBaseUrl; // 获取 API 基础 URL
        const isEdit = CDB.isEdit; // 获取编辑模式
        const promptDiy = CDB.promptDiy; // 获取自定义 Prompt
        const imgEnabled = CDB.imgEnabled; // 获取画图开关
        const imgBaseUrl = CDB.imgBaseUrl; // 获取画图 API 基础 URL
        const imgMode = CDB.imgMode; // 获取画图模型
        const imgApiKey = CDB.imgApiKey; // 获取画图 API 密钥

        // 使用动态导入获取 ChatGPTAPI 和 got
        const { ChatGPTAPI } = await import('chatgpt'); // 导入 ChatGPT API
        const got = await import('got'); // 导入 got 库

        let gptAPI = new ChatGPTAPI({
            apiKey: apiKey,
            apiBaseUrl: apiBaseUrl,
            completionParams: { model: CDB.modeSel }, // 设置使用的模型
            debug: false
        });

        // 处理 'ai' 命令
        if (sender.param(1) === 'ai') {
            let prompt = promptDiy || prompts[CDB.promptSel].prompt; // 获取选定的预设 Prompt 或自定义 Prompt
            const promptMessage = `${prompt}，另外，输出字符限制，输出50-100字。`;
            await relpyMod(sender, isEdit, `正在思考中，请稍后...`); // 发送思考中的提示
            let fistChat = sender.param(2) || '你好'; // 初始聊天内容
            
            let response = await gptAPI.sendMessage(fistChat, {
                systemMessage: promptMessage,
                timeoutMs: 3 * 10 * 1000 // 设置超时时间
            });
            await relpyMod(sender, isEdit, response.text); // 发送回复内容
            
            while (true) {
                let input = await sender.waitInput(() => { }, 60); // 等待用户输入
                if (!input) {
                    await relpyMod(sender, isEdit, "对话超时。"); // 超时提示
                    break;
                }
                input = input.getMsg(); // 获取用户输入的消息
                if (input.toLowerCase() === 'q') {
                    await relpyMod(sender, isEdit, "对话结束。"); // 结束对话
                    break;
                }
                if (input === '') continue; // 如果输入为空，继续循环
                try {
                    response = await gptAPI.sendMessage(input, {
                        parentMessageId: response.id // 使用上一条消息的 ID
                    });
                    await relpyMod(sender, isEdit, response.text); // 发送回复内容
                } catch (error) {
                    console.log(error); // 打印错误信息
                    return; // 退出
                }
            }
        } else if (sender.param(1) === '画图') {
            // 处理 '画图' 命令
            if (!imgEnabled) return await relpyMod(sender, isEdit, "未启用画图功能"); // 检查画图开关
            if (!imgBaseUrl) return await relpyMod(sender, isEdit, "未配置画图ApiBaseUrl"); // 检查画图 API 基础 URL
            if (!imgApiKey) return await relpyMod(sender, isEdit, "未配置画图ApiKey"); // 检查画图 API 密钥
            if (!imgMode) return await relpyMod(sender, isEdit, "未配置画图模型"); // 检查画图模型
            
            await relpyMod(sender, isEdit, '正在生成图像，请稍后'); // 提示生成图像
            try {
                const response = await retryRequest(() =>
                    got.default.post(`${imgBaseUrl}/images/generations`, {
                        json: {
                            model: imgMode, // 使用指定的画图模型
                            prompt: `画一幅图，${sender.param(2)}` // 使用用户提供的提示
                        },
                        headers: {
                            'Authorization': `Bearer ${imgApiKey}` // 使用 API 密钥进行身份验证
                        }
                    })
                );
                let data = JSON.parse(response.body).data; // 解析响应数据
                let dataUrl = data[0].url; // 获取图像 URL
                await relpyMod(sender, isEdit, { type: 'image', path: dataUrl }); // 发送生成的图像
            } catch (error) {
                await relpyMod(sender, isEdit, '画图出现异常，请去控制台查看错误提示'); // 提示发生错误
                console.log(error); // 打印错误信息
                return; // 退出
            }
        }
    } catch (error) {
        console.error("模块检查或执行时发生错误:", error);
    }
};

// 定义 relpyMod 函数
async function relpyMod(s, isEdit, message) {
    const userId = s.getUserId(); // 获取用户 ID
    if (isEdit) {
        await s.edit(message); // 如果启用了编辑模式，编辑消息
    } else {
        await s.reply(message); // 否则发送新消息
    }
}

// 重试机制
async function retryRequest(fn, retries = 3, delay = 1000) {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (error) {
            if (i === retries - 1) throw error; // 如果是最后一次重试，抛出错误
            console.log(`请求失败，重试 ${i + 1}/${retries} 次...`); // 输出重试信息
            await new Promise(resolve => setTimeout(resolve, delay)); // 等待重试延迟
        }
    }
}
