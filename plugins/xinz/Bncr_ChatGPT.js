/**
 * @author seven
 * @name Bncr_ChatGP
 * @team xinz
 * @version 1.2.0
 * @description ChatGpt聊天 借助于chatgpt模块，增加tts功能
 * @rule ^(ai) ([\s\S]+)$
 * @rule ^(ai)$
 * @rule ^(yy) ([\s\S]+)$
 * @admin false
 * @public false
 * @priority 10
 * @platform wx pgm tg web qq ntqq
 * @disable false
 * @systemVersion >=:2.0.5
 * @classification ["ai","gpt"]
 */

/* 
默认使用gpt3.5模型，见55行，如果gpt4模型调用失败，使用gpt3.5模型继续调用
请输入set ChatGPT apiKey设置apiKey
请输入set ChatGPT apiBaseUrl设置apiBaseUrl
prompt的位置为mod/prompts.json
prompt的格式为：{act: '角色', prompt: '内容', user: '用户id'}
todo
1. 添加对话模型引入 ✔
2. 添加对话模型选择 gpt3.5 gpt4 gpts(联网能力) ✔
3. initPrompt,发起会话调用数据库内prompt，数据库内无数据则生成，prompt为默认，修改handleUserActions，添加当前使用模型xx
4. gpt 4 mobile 的连续对话中对于img的传递 ✔
5. handleInput对于用户输入的img的处理,如何修改ntqq适配器使其接收图片的输出为[CQ:image,file=xxx] ✔
6. 取消模型的选择，加入命令ai model ,并在第一条输出中提示当前使用模型
12.17 添加画图功能 ✔
12.19 添加backendUrl，用于调用pandoraToV1Api ✔
12.21 优化请求格式，实现连续对话中对于img的传递
2024.2.8 取消画图 backendurl  * @rule ^(画图) ([\s\S]+)$ ✔
2024.4.10 添加tts功能* @rule ^(yy) ([\s\S]+)$ ✔,重写调用chatgpt模块，got发送请求
*/
module.exports = async s => {
    /* 补全依赖 */
    const fs = require('fs');
    const path = require('path');
    const got = require('got');
    const { randomUUID } = require('crypto');
    const promptFilePath = './mod/prompts.json';
    const fullPath = path.join(__dirname, promptFilePath);
    const chatGPTStorage = new BncrDB('ChatGPT');
    const apiKey = await chatGPTStorage.get('apiKey');
    const apiBaseUrl = await chatGPTStorage.get('apiBaseUrl');
    const user = s.getUserId();
    let name = s.getUserName();
    const groupId = s.getGroupId();
    const platform = s.getFrom();
    const gptAPI = initializeChatGPTAPI(apiKey, apiBaseUrl, "web-gpt-4o-mini");
    if (groupId !== 0) name = `-来自${name}`;
    if (!apiKey) return s.reply("请输入set ChatGPT apiKey设置apiKey");
    if (!apiBaseUrl) return s.reply("请输入set ChatGPT apiBaseUrl设置apiBaseUrl");
    let opt = {
        timeoutMs: 60 * 1000,
    };
    if (s.param(1) === 'yy') {
        await aiSpeech(s.param(2));
        return;
    }
    else if (s.param(1) === 'ai') {
        let prompts = []
        try {
            prompts = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
        } catch (error) {
            handleError(error);
        }
        let ownPrompts = []
        let promptStr = `| 编号  | 角色  \n`
        let num = 0;
        prompts.forEach((item, index) => {
            if (item.user && item.user !== user) return;
            ownPrompts.push(item);
            promptStr += `| ${num}  | ${item.act}  \n`
            num++;
        });
        if (!s.param(2)) {
            s.reply(promptStr);
            await handleUserActions(ownPrompts, prompts);
            return;
        }
        promptStr += `3秒内自动选择默认promot\n输入a管理个人自定义prompt，q退出。`
        s.reply(promptStr);
        let promptIndex = await s.waitInput(() => { }, 3);
        console.log(promptIndex)
        if (promptIndex && promptIndex.getMsg().toLowerCase() === 'q') {
            s.reply("对话结束。", name);
            return;
        }
        if (!promptIndex) {
            promptIndex = 0;
        } else {
            promptIndex = promptIndex.getMsg();
            if (promptIndex.toLowerCase() === 'a') {
                await handleUserActions(ownPrompts, prompts);
            }
        }
        let prompt = ownPrompts[promptIndex];
        if (!prompt) {
            s.reply("对话结束。", name);
            return;
        }
        let history = [{
            role: 'system', content: prompt.prompt + '，另外，输出字符限制，输出50-100字'
        }]
        s.reply(`Let me see...`);
        history.push({ role: 'user', content: s.param(2) });
        try {
            let response = await fetchOpenAICompletions(gptAPI, history);
            history.push({
                role: 'assistant', content: response
            });
            s.reply(response);
            await continuousDialogue(gptAPI);
        }
        catch (error) {
            handleError(error);
            //如果错误信息包含OpenAI error 429，使用gpt3.5模型继续调用
            if (error.toString().indexOf('OpenAI error 429') !== -1) {
                s.reply("gpt4模型调用失败，正在使用gpt3.5模型");
                try {
                    let response = await fetchOpenAICompletions(gptAPI, history);
                    history.push({ role: 'assistant', content: [{ type: "text", text: response }] });
                    await s.reply(response);
                    await continuousDialogue(gptAPI);
                }
                catch (error) {
                    handleError(error);
                    return;
                }
            }
            return;
        }
        async function continuousDialogue(gptAPI) {
            while (true) {
                let input = await s.waitInput(() => { }, 60);
                if (!input) {
                    s.reply("对话超时。", name);
                    break;
                }
                input = input.getMsg();
                if (input.toLowerCase() === 'q') {
                    s.reply("对话结束。", name);
                    break;
                }
                history.push({
                    role: 'user', content: input
                });
                let response;
                try {
                    response = await fetchOpenAICompletions(gptAPI, history);
                    if (response) {
                        history.push({ role: 'assistant', content: response });
                        s.reply(response);
                    } else {
                        throw new Error('continuousDialogue error');
                    }
                } catch (error) {
                    handleError(error);
                    return;
                }
            }
        }
    }
    async function aiSpeech(text) {
        const body = {
            "model": "tts-s",
            "input": text,
            "voice": "echo",//alloy fable onyx nova shimmer
            "response_format": "mp3"
        }
        const auth = `Bearer ${apiKey}`;
        try {
            const response = await got.post(apiBaseUrl + '/audio/speech', {
                json: body,
                headers: {
                    'Authorization': auth
                },
                responseType: 'buffer',

            });
            // console.log(response)
            //获取响应mp3音频
            let rawBody = response.rawBody;
            if (!rawBody) {
                throw new Error(`Data validation error in response，${response.body}}`);
            }
            let url = await handleAudioResponse(rawBody);
            sendAudio(platform, url)
            let input = await s.waitInput(() => { }, 120);
            //如果input=[group_recall]&operator_id=s.getUserId()，则撤回消息
            if (input && input.getMsg() === '[group_recall]&operator_id=' + s.getUserId()) {
                console.log('delinfo' + await s.delMsg());
                s.reply(`${s.getUserName()}刚刚撤回了\n---\n${text}\n---`);
            }
        } catch (error) {
            handleError(error);
        }
        return;
    }
    async function handleUserActions(ownPrompts, prompts) {
        s.reply(`1.添加prompt \n2.删除prompt \n3.修改prompt \n4.查看prompt`);
        let action = await s.waitInput(() => { }, 60);
        if (!action) {
            s.reply("对话结束。", name);
            return;
        }
        action = action.getMsg();
        if (action === '1') {
            s.reply(`请输入prompt的角色`);
            let actor = await s.waitInput(() => { }, 60);
            if (!actor) {
                s.reply("对话结束。", name);
                return;
            }
            actor = actor.getMsg();
            s.reply(`请输入prompt的内容，比如：我想让你扮演讲故事的角色。您将想出引人入胜、富有想象力和吸引观众的有趣故事。`);
            let a = await s.waitInput(() => { }, 60);
            if (!a) {
                s.reply("对话结束。", name);
                return;
            }
            s.reply(`是否使用ai丰富您的prompt？y/n`);
            let useAI = await s.waitInput(() => { }, 60);
            if (!useAI) {
                s.reply("对话结束。", name);
                return;
            }
            useAI = useAI.getMsg();
            if (useAI.toLowerCase() === 'y') {
                let history = [{ role: 'user', content: `我希望你成为我的提示创建者。您的目标是帮助我设计出最符合我需求的提示，多余则删除，不足则丰富，同时审查不健康因素。提示将由你 ChatGPT 使用,提示应清晰、简洁，易于理解,我的提示是---${a.getMsg()}` }]
                let response = await api.sendMessage(JSON.stringify(history), opt);
                await s.reply(response.text);
                s.reply(`prompt是否认同？y/n`)
                let c = await s.waitInput(() => { }, 60);
                if (!c) return;
                else if (c.getMsg() === 'n') {
                    let d = 'n'
                    while (d === 'n') {
                        let response = await api.sendMessage(JSON.stringify(history), opt);
                        await s.reply(response.text, `已退出`);
                        s.reply(`prompt是否认同？y/n`)
                        d = await s.waitInput(() => { }, 60);
                    }
                }
                s.reply(`请输入新的prompt`)
                let e = await s.waitInput(() => { }, 60);
                e = e.getMsg();
                prompts.push({ act: actor, prompt: e, user: user });
                fs.writeFileSync(fullPath, JSON.stringify(prompts));
                s.reply("添加成功");
                return;
            }
            else if (useAI.toLowerCase() === 'n') {
                let e = a.getMsg();
                prompts.push({ act: actor, prompt: e, user: user });
                fs.writeFileSync(fullPath, JSON.stringify(prompts));
                s.reply("添加成功");
                return;
            }

        }
        else if (action === '2') {
            s.reply(`请输入prompt的编号`);
            let index = await s.waitInput(() => { }, 60);
            if (!index) {
                s.reply("对话结束。", name);
                return;
            }
            index = index.getMsg();
            delPrompt = ownPrompts[index];
            let exist = false;
            //find delPrompt in prompts
            prompts.forEach((item, index) => {
                if (item.act === delPrompt.act && item.prompt === delPrompt.prompt && item.user === user) {
                    prompts.splice(index, 1);
                    exist = true;
                }
            });
            fs.writeFileSync(fullPath, JSON.stringify(prompts));
            //如果prompts中不包含delPrompt，回复删除成功，
            //否则回复删除失败
            if (exist) s.reply("删除成功");
            else s.reply("删除失败");
            return;
        }
        else if (action === '3') {
            s.reply(`请输入prompt的编号`);
            let index = await s.waitInput(() => { }, 60);
            if (!index) {
                s.reply("对话结束。", name);
                return;
            }
            index = index.getMsg();
            let changePrompt = ownPrompts[index];
            s.reply(`${ownPrompts[index].prompt}\n请输入prompt的内容`);
            let content = await s.waitInput(() => { }, 60);
            if (!content) {
                s.reply("对话结束。", name);
                return;
            }
            content = content.getMsg();
            //find changePrompt in prompts
            prompts.forEach((item, index) => {
                if (item.act === changePrompt.act && item.prompt === changePrompt.prompt && item.user === user) {
                    prompts[index].prompt = content;
                }
            });
            fs.writeFileSync(fullPath, JSON.stringify(prompts));
            s.reply("修改成功");
            return;
        }
        else if (action === '4') {
            s.reply(`请输入prompt的编号`);
            let index = await s.waitInput(() => { }, 60);
            if (!index) {
                s.reply("对话结束。", name);
                return;
            }
            index = index.getMsg();
            s.reply(`prompt的内容为：${ownPrompts[index].prompt}`);
            return;
        }
        else {
            s.reply("对话结束。", name);
            return;
        }
    }
    function initializeChatGPTAPI(apiKey, baseUrl, model) {
        return {
            apiKey: apiKey,
            apiBaseUrl: baseUrl,
            completionParams: {
                model: model
            }
        };
    }
    async function fetchOpenAICompletions(gptAPI, messages, timeout = 30000) {
        console.log(gptAPI.apiBaseUrl, gptAPI.completionParams.model, messages);
        const fetchPromise = got.post(`${gptAPI.apiBaseUrl}/chat/completions`, {
            json: {
                model: gptAPI.completionParams.model,
                messages: messages,
                stream: false
            },
            responseType: 'json',
            timeout: timeout,
            headers: {
                'Authorization': `Bearer ${gptAPI.apiKey}`
            }
        });

        try {
            const response = await fetchPromise;

            if (response.statusCode !== 200) {
                throw new Error(`HTTP error! status: ${response.statusCode}`);
            }
            console.log(response.body.choices[0].message);
            const res = response.body.choices[0].message.content;
            return res;
        } catch (error) {
            console.error(`Fetch error: ${error.message}`);
            console.error(`Error stack: ${error.stack}`);
            if (error.response) {
                console.error(`Response status: ${error.response.statusCode}`);
                console.error(`Response data: ${JSON.stringify(error.response.body, null, 2)}`);
            }
            return null;
        }
    }
    async function handleAudioResponse(response) {
        // 保存音频文件handleAudioResponse
        const fileId = randomUUID() + '.mp3'
        const audioPath = path.join("/bncr/BncrData/public/", fileId);
        fs.writeFile(audioPath, response, (err) => {
            if (err) {
                console.error('写入文件时出错:', err);
                return;
            }
        });
        let url = `http://172.17.0.4:9090/public/${fileId}`;
        console.log(audioPath, url);

        return url;
    }
    function handleError(error) {
        console.log(error);
        let errorMessage = error.message || error.toString();
        errorMessage = unicodeToChinese(errorMessage);
        s.reply("发生错误: " + errorMessage + name);
    }
    function sendAudio(platform, url) {
        if (platform === 'qq') s.reply(`[CQ:record,file=${url}]`);
        else if (platform === 'ntqq') {
            const obj = {
                platform: 'ntqq',
                type: 'record',
                msg: ``,
                path: url,
                groupId: s.getGroupId(),
            }
            console.log(obj);
            console.log(sysMethod.push(obj))
        }
    }
    function isUnicode(str) {
        // 正则表达式检查字符串是否包含Unicode转义序列
        return /\\u[\dA-F]{4}/i.test(str);
    }
    function unicodeToChinese(text) {
        // 将Unicode转义序列转换为普通字符串
        if (isUnicode(text)) {
            return text.replace(/\\u([\dA-F]{4})/gi, function (match, grp) {
                return String.fromCharCode(parseInt(grp, 16));
            });
        } else {
            return text;
        }
    }
};

