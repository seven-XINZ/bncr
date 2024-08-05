/**
 * @author seven
 * @name ChatGPT
 * @team xinz
 * @version 1.0.5
 * @description ChatGpt聊天，适配无界3.0，增加TTS功能
 * @rule ^(ai|画图|yy) ([\s\S]+)$
 * @rule ^(ai|yy|画图)$
 * @admin false
 * @priority 99999
 * @classification ["插件"]
 * @disable false
 */

const fs = require('fs'); // 文件系统模块，用于读取文件
const path = require('path'); // 路径模块，用于处理文件路径
const { execSync } = require('child_process'); // 用于执行命令的模块
const promptFilePath = './mod/prompts.json'; // prompts 文件路径
const fullPath = path.join(__dirname, promptFilePath); // 获取 prompts 文件的完整路径

// 需要安装的模块列表
const requiredModules = ['got', 'chatgpt'];

// 检查并安装缺失的模块
function installModules(modules) {
    modules.forEach(module => {
        try {
            // 尝试导入模块
            require(module);
            console.log(`模块 ${module} 已安装.`);
        } catch (error) {
            // 如果导入失败，安装模块
            console.log(`模块 ${module} 未安装，正在尝试安装...`);
            execSync(`npm install ${module}`, { stdio: 'inherit' });
            console.log(`模块 ${module} 安装成功.`);
        }
    });
}

// 检查并安装所需模块
installModules(requiredModules);

// 读取 prompts 文件
let prompts = [];
try {
    prompts = JSON.parse(fs.readFileSync(fullPath, 'utf-8')); // 从文件中读取 prompts
} catch (error) {
    console.error("读取 prompts 文件时发生错误:", error);
}

// 生成 prompts 选项
let promptNums = [],
    promptNames = [];
for (let i = 0; i < prompts.length; i++) {
    promptNums.push(i);
    promptNames.push(prompts[i].act);
}

// 定义模型选项
const modes = ['web-gpt-3.5-turbo', 'web-gpt-4o-mini', 'gpt-3.5-turbo-16k', 'gpt-4', 'gpt-4-browsing', 'gpt-4-dalle', 'gpt-4-32k', 'midjourney', 'dall-e-2', 'dall-e-3'];

// 插件界面
const BCS = BncrCreateSchema; // 创建插件界面
const jsonSchema = BCS.object({
    apiBaseUrl: BCS.string().setTitle('ApiBaseUrl').setDescription('必填项，一般为"域名/v1"').setDefault(''), // API 基础 URL
    apiKey: BCS.string().setTitle('ApiKey').setDescription('必填项').setDefault(''), // API 密钥
    isEdit: BCS.boolean().setTitle('HumanTG是否开启编辑模式').setDescription('关闭则逐条回复，不编辑消息').setDefault(false), // 编辑模式开关
    promptSel: BCS.number().setTitle('选择预设角色').setDescription('请根据需要选择').setEnum(promptNums).setEnumNames(promptNames).setDefault(0), // 选择预设角色
    modeSel: BCS.string().setTitle('选择GPT模型').setDescription('请根据需要选择').setEnum(modes).setDefault('gpt-3.5-turbo'), // 选择 GPT 模型
    promptDiy: BCS.string().setTitle('请输入自定义Prompt').setDescription('输入自定义Prompt会使预设角色失效').setDefault(''), // 自定义 Prompt
    imgBaseUrl: BCS.string().setTitle('画图的ApiBaseUrl').setDescription('启用画图功能必填，一般为"域名/v1"').setDefault(''), // 画图 API 基础 URL
    imgMode: BCS.string().setTitle('画图的模型').setDescription('启用画图功能必填，根据自己的API支持情况填写').setDefault(''), // 画图模型
    imgApiKey: BCS.string().setTitle('画图的ApiKey').setDescription('启用画图功能必填，根据自己的API支持情况填写').setDefault(''), // 画图 API 密钥
    ttsEnabled: BCS.boolean().setTitle('启用TTS功能').setDescription('开启后将使用TTS功能').setDefault(false), // TTS开关
    ttsApiBaseUrl: BCS.string().setTitle('TTS ApiBaseUrl').setDescription('启用TTS功能必填，一般为"域名/v1"').setDefault(''), // TTS API 基础 URL
    ttsApiKey: BCS.string().setTitle('TTS ApiKey').setDescription('启用TTS功能必填，根据自己的API支持情况填写').setDefault(''), // TTS API 密钥
});

const ConfigDB = new BncrPluginConfig(jsonSchema); // 创建配置数据库

// 定义 relpyMod 函数
async function relpyMod(s, isEdit, message) {
    const userId = s.getUserId(); // 获取用户 ID
    if (isEdit) {
        await s.edit(message); // 如果启用了编辑模式，编辑消息
    } else {
        await s.reply(message); // 否则发送新消息
    }
}

module.exports = async s => {
    await ConfigDB.get(); // 获取配置
    const CDB = ConfigDB.userConfig; // 获取用户配置
    if (!Object.keys(CDB).length) return await s.reply('请先到WEB界面完成插件首次配置'); // 检查配置是否存在

    if (!CDB.apiBaseUrl) return s.reply("未配置ApiBaseUrl"); // 检查 API 基础 URL
    if (!CDB.apiKey) return s.reply("未配置ApiKey"); // 检查 API 密钥

    const apiKey = CDB.apiKey; // 获取 API 密钥
    const apiBaseUrl = CDB.apiBaseUrl; // 获取 API 基础 URL
    const isEdit = CDB.isEdit; // 获取编辑模式
    const promptDiy = CDB.promptDiy; // 获取自定义 Prompt
    const imgBaseUrl = CDB.imgBaseUrl; // 获取画图 API 基础 URL
    const imgMode = CDB.imgMode; // 获取画图模型
    const imgApiKey = CDB.imgApiKey; // 获取画图 API 密钥
    const ttsEnabled = CDB.ttsEnabled; // 获取TTS开关
    const ttsApiBaseUrl = CDB.ttsApiBaseUrl; // 获取TTS API 基础 URL
    const ttsApiKey = CDB.ttsApiKey; // 获取TTS API 密钥

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
    if (s.param(1) === 'ai') {
        let prompt = '';
        if (!promptDiy) {
            prompt = prompts[CDB.promptSel].prompt; // 获取选定的预设 Prompt
        } else {
            prompt = promptDiy; // 使用自定义 Prompt
        }
        const promptMessage = `${prompt}，另外，输出字符限制，输出50-100字。`;
        await relpyMod(s, isEdit, `正在思考中，请稍后...`); // 发送思考中的提示
        let fistChat = '你好'; // 初始聊天内容
        if (s.param(2)) fistChat = s.param(2); // 如果有第二个参数，则使用该参数
        let response = await gptAPI.sendMessage(fistChat, {
            systemMessage: promptMessage,
            timeoutMs: 3 * 10 * 1000 // 设置超时时间
        });
        await relpyMod(s, isEdit, response.text); // 发送回复内容
        while (true) {
            let input = await s.waitInput(() => { }, 60); // 等待用户输入
            if (!input) {
                await relpyMod(s, isEdit, "对话超时。"); // 超时提示
                break;
            }
            input = input.getMsg(); // 获取用户输入的消息
            if (input.toLowerCase() === 'q') {
                await relpyMod(s, isEdit, "对话结束。"); // 结束对话
                break;
            }
            if (input == '') continue; // 如果输入为空，继续循环
            try {
                response = await gptAPI.sendMessage(input, {
                    parentMessageId: response.id // 使用上一条消息的 ID
                });
                await relpyMod(s, isEdit, response.text); // 发送回复内容
            } catch (error) {
                console.log(error); // 打印错误信息
                return; // 退出
            }
        }
    } else if (s.param(1) === '画图') {
        // 处理 '画图' 命令
        if (!imgBaseUrl) return await relpyMod(s, isEdit, "未配置画图ApiBaseUrl"); // 检查画图 API 基础 URL
        if (!imgApiKey) return await relpyMod(s, isEdit, "未配置画图ApiKey"); // 检查画图 API 密钥
        if (!imgMode) return await relpyMod(s, isEdit, "未配置画图模型"); // 检查画图模型
        await relpyMod(s, isEdit, '正在生成图像，请稍后'); // 提示生成图像
        try {
            const response = await got.default.post(imgBaseUrl + '/images/generations', {
                json: {
                    model: imgMode, // 使用指定的画图模型
                    prompt: `画一幅图，${s.param(2)}` // 使用用户提供的提示
                },
                headers: {
                    'Authorization': `Bearer ${imgApiKey}` // 使用 API 密钥进行身份验证
                }
            });
            let data = JSON.parse(response.body).data; // 解析响应数据
            let dataUrl = data[0].url; // 获取图像 URL
            await relpyMod(s, isEdit, { type: 'image', path: dataUrl }); // 发送生成的图像
        } catch (error) {
            await relpyMod(s, isEdit, '画图出现异常，请去控制台查看错误提示'); // 提示发生错误
            console.log(error); // 打印错误信息
            return; // 退出
        }
    } else if (s.param(1) === 'yy') {
        // 处理 'yy' 命令以启动 TTS
        if (!ttsEnabled) return await relpyMod(s, isEdit, "未启用TTS功能"); // 检查 TTS 开关
        if (!ttsApiBaseUrl) return await relpyMod(s, isEdit, "未配置TTS ApiBaseUrl"); // 检查 TTS API 基础 URL
        if (!ttsApiKey) return await relpyMod(s, isEdit, "未配置TTS ApiKey"); // 检查 TTS API 密钥

        const message = s.param(2) || '你好，这是一个TTS测试。'; // 获取用户输入的消息
        await relpyMod(s, isEdit, `正在生成语音，请稍后...`); // 提示正在生成语音
        try {
            const ttsResponse = await got.default.post(`${ttsApiBaseUrl}/synthesize`, {
                json: {
                    text: message,
                    voice: 'zh-CN-XiaoyiNeural', // 根据需要设置语音
                    format: 'mp3' // 根据需要设置格式
                },
                headers: {
                    'Authorization': `Bearer ${ttsApiKey}`, // 使用 TTS API 密钥进行身份验证
                    'Content-Type': 'application/json'
                },
                responseType: 'buffer' // 获取音频数据为 Buffer
            });

            // 发送生成的音频文件
            await s.reply({ 
                content: '语音合成完成，以下是您的语音：', 
                files: [{ name: 'speech.mp3', data: ttsResponse }] // 将音频数据作为文件发送
            });
        } catch (error) {
            console.error("TTS请求失败:", error);
            await relpyMod(s, isEdit, "生成语音时发生错误，请稍后再试。");
        }
    }

    // relpyMod 函数的实现
    async function relpyMod(s, isEdit, replyVar) {
        const userId = s.getUserId(); // 获取用户 ID
        if (isEdit) {
            await s.edit(replyVar); // 如果是编辑模式，编辑消息
        } else {
            await s.reply(replyVar); // 否则发送新消息
        }
    }
};
