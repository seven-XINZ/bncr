/**
 * @author Merrick
 * @name Gemini
 * @version 1.0.2
 * @description gemini聊天
 * @team xinz
 * @rule ^(gems|gemc|gemp)([\s\S]+)$
 * @admin false
 * @public true
 * @priority 9999
 * @classification ["插件"]
 * @disable false
 */

/*
使用方法：打开https://ai.google.dev/ 获取API key并填入配置界面（获取方法请自行搜索）

命令说明：gems是单问答模式，gemc是聊天模式，gemp是识图模式（目前只能识别图片链接）
         命令+内容就可以触发，有人行的可以直接回复命令。

如后台提示"User location is not supported for the API use"，请尝试调整梯子

v1.0.1 优化代码，增加单问答模式，修改触发命令，界面增加Max Tokens选项
v1.0.0 基于sumuen大佬的插件修改，本人仅修复bug和适配2.0界面
v1.0.2 适配3.0
*/

const jsonSchema = BncrCreateSchema.object({
    apiKey: BncrCreateSchema.string().setTitle('API key').setDescription('请输入获取到的Gemini API key').setDefault(""),
    maxTokens: BncrCreateSchema.number().setTitle('Max Tokens').setDescription('聊天模式中最大Token数，设置越大可以聊得越久').setDefault(500)
});
const ConfigDB = new BncrPluginConfig(jsonSchema);
const got = require('got');
const fs = require('fs');
const { randomUUID } = require("crypto");
const path = require('path');

module.exports = async s => {
    await ConfigDB.get();
    if (!Object.keys(ConfigDB.userConfig).length) {
        return await s.reply('请先发送"修改无界配置",或者前往前端web"插件配置"来完成插件首次配置');
    }

    const { GoogleGenerativeAI } = require("@google/generative-ai");
    const apiKey = ConfigDB.userConfig.apiKey,
        maxTokens = ConfigDB.userConfig.maxTokens;
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-pro"});

    const msg = s.param(1);
    if (msg) {
        if (msg === 'gems') {
            const textIn = s.param(2);
            const textOut = await textAns(textIn);
            s.reply(`Gemini回复的内容：\n\n${textOut}`);
        } else if (msg === 'gemc') {
            const textIn = s.param(2);
            await textChat(textIn);
        } else if (msg === 'gemp') {
            const textIn = s.param(2);
            await picAns(textIn);
        }
    }

    // 单文本回答
    async function textAns(prompt) {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        return text;
    }

    // 聊天场景
    async function textChat(prompt) {
        const chat = model.startChat({
            history: [
                {
                    role: "user",
                    parts: [{ text: "Hello, I have 2 dogs in my house." }],
                },
                {
                    role: "model",
                    parts: [{ text: "Great to meet you. What would you like to know?" }],
                },
            ],
            generationConfig: {
                maxOutputTokens: maxTokens,
            },
        })

        try {
            const result = await chat.sendMessage(prompt);
            const response = await result.response;
            const text = response.text();
            s.reply(`GeminiChat:\n\n${text}\n\n回复gemq退出聊天`);
            while (true) { // 进入持续对话模式
                let input = await s.waitInput(() => { }, 60);
                if (!input) {
                    s.reply("对话超时");
                    break;
                };
                input = input.getMsg();
                if (input.toLowerCase() === 'gemq') { // 用户可以通过输入 'exit' 来退出对话
                    s.reply("对话结束");
                    break;
                }
                // 发送请求到 ChatGPT API，并包含历史记录
                let result = await chat.sendMessage(input);
                const response = await result.response;
                const text = response.text();
                s.reply(`Gemini Chat:\n\n${text}\n\n回复gemq退出聊天`);
            }
        } catch (error) {
            // 捕获并处理异常
            console.error('发生异常:', error);
            s.reply(`Gemini发生异常,退出聊天`);
            return;
        }
    }

    function fileToGenerativePart(path, mimeType) {
        return {
            inlineData: {
                data: Buffer.from(fs.readFileSync(path)).toString("base64"),
                mimeType
            },
        };
    }

    async function picAns(picUrl){
        const regex = /http/g;
        const matchedUrls = picUrl.match(regex);
        if (matchedUrls) {
            //通过got获取图片并保存到本地
            const { body } = await got.get(picUrl, { responseType: 'buffer' });
            const imgpath = path.join("/bncr/BncrData/public/", randomUUID()+'.jpg')
            console.log(imgpath)
            fs.writeFile(imgpath, body, (err) => {
                if (err) {
                    console.error('写入文件时出错:', err);
                    return;
                }
            });
            await sysMethod.sleep(1);
            const model = genAI.getGenerativeModel({ model: "gemini-pro-vision" });
            const prompt = "你看到了什么?";
            const imageParts = [
                fileToGenerativePart(imgpath, "image/jpeg"),
            ];
            const result = await model.generateContent([prompt, ...imageParts]);
            const response = await result.response;
            const text = response.text();
            console.log(text);
            s.reply(`Gemini识图结果:\n\n${text}`);
            fs.unlinkSync(imgpath);
        } else {
            s.reply(`无法识别图片`)
        }
    }
}
