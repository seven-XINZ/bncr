/**
 * @author Merrick & Collaborator (AI)
 * @name Gemini
 * @version 1.0.3
 * @description gemini聊天, 支持自定义模型
 * @team xinz
 * @rule ^(gems|gemc|gemp)([\s\S]+)$
 * @admin true
 * @public false
 * @priority 9999
 * @classification ["插件"]
 * @disable false
 */
/*
使用方法：打开https://ai.google.dev/ 获取API key并填入配置界面（获取方法请自行搜索）

命令说明：gems是单问答模式，gemc是聊天模式，gemp是识图模式（目前只能识别图片链接）
         命令+内容就可以触发，有人行的可以直接回复命令。

如后台提示"User location is not supported for the API use"，请尝试调整梯子

v1.0.3 增加模型自定义配置项，优化错误处理和临时文件清理 (By AI)
v1.0.2 适配3.0 (By Merrick)
v1.0.1 优化代码，增加单问答模式，修改触发命令，界面增加Max Tokens选项 (By Merrick)
v1.0.0 基于sumuen大佬的插件修改 (By Merrick)
*/

// 定义插件配置的 Schema
const jsonSchema = BncrCreateSchema.object({
    apiKey: BncrCreateSchema.string().setTitle('API key').setDescription('请输入获取到的Gemini API key').setDefault(""),
    maxTokens: BncrCreateSchema.number().setTitle('Max Tokens').setDescription('聊天模式中最大Token数，设置越大可以聊得越久').setDefault(500),
    textModelName: BncrCreateSchema.string()
        .setTitle('文本/聊天模型名称')
        .setDescription('用于处理文本问答(gems)和聊天(gemc)的模型。例如: gemini-1.5-flash-latest, gemini-1.5-pro-latest。请填写 Google AI Studio 中可用的模型名称。')
        .setDefault("gemini-1.5-flash-latest"), // 设置一个推荐的默认值
    visionModelName: BncrCreateSchema.string()
        .setTitle('识图模型名称')
        .setDescription('用于处理图片识别(gemp)的模型。例如: gemini-1.5-flash-latest, gemini-1.5-pro-latest (这些新模型同时支持文本和视觉)。请填写支持视觉功能的模型名称。')
        .setDefault("gemini-1.5-flash-latest") // 设置一个推荐的默认值 (flash也支持视觉)
});

// 创建配置数据库实例
const ConfigDB = new BncrPluginConfig(jsonSchema);

// 引入所需模块
const fs = require('fs');
const { randomUUID } = require("crypto");
const path = require('path');

// 主函数入口
module.exports = async s => {
    // 获取配置，如果未配置则提示
    await ConfigDB.get();
    if (!Object.keys(ConfigDB.userConfig).length || !ConfigDB.userConfig.apiKey) { // 检查apiKey是否为空
        return await s.reply('请先发送"修改无界配置",或者前往前端web"插件配置"来完成插件首次配置(API Key为必填项)');
    }

    // 动态导入 got (用于下载图片)
    let got;
    try {
        ({ default: got } = await import('got'));
    } catch (e) {
        console.error("加载 got 模块失败:", e);
        return s.reply("加载网络请求模块失败，请检查依赖或环境。");
    }


    // 引入 Google Generative AI SDK
    let GoogleGenerativeAI;
    try {
         ({ GoogleGenerativeAI } = require("@google/generative-ai"));
    } catch (e) {
         console.error("加载 @google/generative-ai 模块失败:", e);
         return s.reply("加载 Gemini AI 模块失败，请在Bncr根目录执行 npm install @google/generative-ai");
    }


    // 读取配置信息
    const apiKey = ConfigDB.userConfig.apiKey;
    const maxTokens = ConfigDB.userConfig.maxTokens;
    // 读取用户自定义的模型名称，如果用户没填，则使用 schema 中定义的默认值
    const textModelName = ConfigDB.userConfig.textModelName || "gemini-1.5-flash-latest";
    const visionModelName = ConfigDB.userConfig.visionModelName || "gemini-1.5-flash-latest";

    // 初始化 Google AI 客户端
    let genAI;
    try {
        genAI = new GoogleGenerativeAI(apiKey);
    } catch(e) {
        console.error("初始化 GoogleGenerativeAI 失败:", e);
        return s.reply("初始化 Gemini AI 客户端失败，请检查 API Key 是否正确。");
    }

    // 使用用户配置的文本模型名称初始化默认模型
    let model;
    try {
        model = genAI.getGenerativeModel({ model: textModelName });
    } catch(e) {
        console.error(`获取文本模型 ${textModelName} 失败:`, e);
        return s.reply(`初始化文本模型 (${textModelName}) 失败，请检查模型名称是否正确或可用。`);
    }


    // --- 命令路由 ---
    const command = s.param(1)?.toLowerCase(); // 获取命令并转小写
    const content = s.param(2);                // 获取命令后的内容

    // 检查内容是否为空 (对于需要内容的命令)
    if (!content && ['gems', 'gemc', 'gemp'].includes(command)) {
        return s.reply("命令后面需要加上内容哦！");
    }

    try { // 包裹整个命令处理逻辑，捕获意外错误
        if (command === 'gems') {
            await s.reply("Gemini思考中...");
            const textOut = await textAns(content);
            await s.reply(textOut ? `Gemini回复的内容：\n\n${textOut}` : "Gemini未能生成回复。");
        } else if (command === 'gemc') {
            await s.reply("Gemini聊天初始化...");
            await textChat(content);
        } else if (command === 'gemp') {
            await s.reply("Gemini识图中...");
            await picAns(content);
        }
        // 如果命令不是 gems, gemc, gemp，则不执行任何操作 (或者可以添加提示)
        // else {
        //     s.reply("未知命令，请使用 gems, gemc 或 gemp。");
        // }

    } catch (error) {
        console.error("处理命令时发生未捕获异常:", error);
        await s.reply(`处理命令时发生内部错误: ${error.message || '未知错误'}`);
    }


    // --- 功能函数 ---

    // 单文本回答
    async function textAns(prompt) {
        try {
            const result = await model.generateContent(prompt);
            const response = await result.response;
            // 增加检查，防止 response 或 text() 方法不存在
            return response?.text ? response.text() : null;
        } catch (error) {
             console.error("单问答(textAns)发生异常:", error);
             await s.reply(`Gemini请求失败: ${error.message || '未知错误'} (状态码: ${error.status || 'N/A'})`);
             return null; // 返回 null 表示失败
        }
    }

    // 聊天场景
    async function textChat(initialPrompt) {
        let chat;
        try {
            chat = model.startChat({
                // 可以保留一个简单的初始对话历史，或根据需要清空
                history: [
                    // { role: "user", parts: [{ text: "你好" }] },
                    // { role: "model", parts: [{ text: "你好！有什么可以帮你的吗？" }] }
                ],
                generationConfig: {
                    maxOutputTokens: maxTokens,
                },
            });
        } catch (error) {
            console.error("启动聊天(startChat)失败:", error);
            return s.reply(`启动Gemini聊天失败: ${error.message || '未知错误'}`);
        }


        try {
            // 发送第一条消息
            const initialResult = await chat.sendMessage(initialPrompt);
            const initialResponse = await initialResult.response;
            const initialText = initialResponse?.text ? initialResponse.text() : "Gemini未能生成回复。";
            await s.reply(`Gemini Chat:\n\n${initialText}\n\n---
回复 'gemq' 退出聊天`);

            // 进入持续对话循环
            while (true) {
                let input = await s.waitInput(() => { }, 60); // 等待用户输入，超时60秒
                if (!input) {
                    await s.reply("对话超时，自动结束。");
                    break;
                }
                const userMessage = input.getMsg();
                if (userMessage.toLowerCase() === 'gemq') { // 退出指令
                    await s.reply("对话已结束。");
                    break;
                }

                // 发送用户后续消息
                await s.reply("Gemini思考中..."); // 添加等待提示
                const result = await chat.sendMessage(userMessage);
                const response = await result.response;
                const text = response?.text ? response.text() : "Gemini未能生成回复。";
                await s.reply(`Gemini Chat:\n\n${text}\n\n---
回复 'gemq' 退出聊天`);
            }
        } catch (error) {
            // 捕获并处理聊天过程中的异常
            console.error('聊天(textChat)发生异常:', error);
            await s.reply(`Gemini聊天发生异常: ${error.message || '未知错误'} (状态码: ${error.status || 'N/A'}), 聊天已终止`);
            return; // 异常时退出函数
        }
    }

    // 本地文件转为 Google AI 的数据部分
    function fileToGenerativePart(filePath, mimeType) {
        try {
            return {
                inlineData: {
                    data: Buffer.from(fs.readFileSync(filePath)).toString("base64"),
                    mimeType
                },
            };
        } catch (error) {
             console.error(`读取或转换文件 ${filePath} 失败:`, error);
             throw new Error(`无法处理本地文件: ${filePath}`); // 抛出异常让调用者处理
        }
    }

    // 识图场景
    async function picAns(imageUrlOrPath) {
        // 简单判断是 URL 还是可能是本地路径 (需要更完善的判断)
        const isUrl = imageUrlOrPath.startsWith('http://') || imageUrlOrPath.startsWith('https://');
        let imgpath = null; // 图片的最终本地路径
        let shouldDelete = false; // 是否需要删除临时下载的文件

        try {
            if (isUrl) {
                // 下载网络图片
                const { body } = await got.get(imageUrlOrPath, { responseType: 'buffer', timeout: { request: 15000 } }); // 增加超时
                // 使用更安全的临时文件路径
                imgpath = path.join(tempfile.gettempdir(), `gemini_pic_${randomUUID()}.jpg`);
                fs.writeFileSync(imgpath, body); // 使用同步写入，简化流程
                shouldDelete = true; // 标记为需要删除
                // console.log("图片已下载到:", imgpath); // 调试信息
            } else {
                // 假设是本地路径 (这里可以添加检查路径是否存在的逻辑)
                if (fs.existsSync(imageUrlOrPath)) {
                    imgpath = imageUrlOrPath;
                } else {
                    return s.reply(`提供的本地路径不存在或不是有效的图片URL: ${imageUrlOrPath}`);
                }
            }

            // 初始化视觉模型实例
            let visionModelInstance;
            try {
                 visionModelInstance = genAI.getGenerativeModel({ model: visionModelName });
            } catch (e) {
                 console.error(`获取视觉模型 ${visionModelName} 失败:`, e);
                 throw new Error(`初始化视觉模型 (${visionModelName}) 失败`); // 抛出异常
            }


            // 准备图片数据和提示词
            const prompt = "详细描述一下你在这张图片里看到了什么？"; // 可以是更具体的提示词
            const imageParts = [
                fileToGenerativePart(imgpath, "image/jpeg"), // 假设是jpg, 需要更智能的类型判断
            ];

            // 调用模型进行内容生成
            const result = await visionModelInstance.generateContent([prompt, ...imageParts]);
            const response = await result.response;
            const text = response?.text ? response.text() : "Gemini未能识别图片内容。";
            await s.reply(`Gemini识图结果:\n\n${text}`);

        } catch (error) {
            console.error('识图(picAns)发生异常:', error);
            await s.reply(`Gemini识图发生异常: ${error.message || '未知错误'} (状态码: ${error.status || 'N/A'})`);
        } finally {
            // 确保在处理完成后删除临时下载的文件
            if (imgpath && shouldDelete) { // 只删除下载的临时文件
                try {
                    fs.unlinkSync(imgpath);
                    // console.log("临时图片文件已删除:", imgpath); // 调试信息
                } catch (unlinkErr) {
                    console.error("删除临时图片文件失败:", unlinkErr);
                    // 可以考虑记录这个错误，但不一定要打断用户流程
                }
            }
        }
    }
};
