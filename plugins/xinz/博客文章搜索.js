/**
 * @author xinz
 * @name 博客文章搜索
 * @team xinz
 * @version 1.3.1
 * @description 根据关键词在配置的 RSS Feed 中搜索文章。需在博客后台开启 RSS 摘要；配置的输出条数尽量大于文章总数。
 * @rule ^博客\s+(.+)$
 * @rule ^[bB][kK]\s+(.+)$
 * @admin false
 * @public false
 * @priority 100
 * @disable false
 * @service false
 */

/*
 * 依赖说明:
 * 1. node-fetch (v3+ is ESM): 用于发起 HTTP 请求获取 RSS 内容。
 * 2. xml2js: 用于解析 XML 格式的 RSS Feed。
 * !! 本插件不再自动安装依赖 !!
 * 如果提示缺少模块，请进入 Bncr 容器执行:
 * npm install node-fetch xml2js
 *
 * 配置说明:
 * 请在 Bncr Web UI 的插件设置界面配置要搜索的 RSS Feed 地址列表。
 */

// --- 引入/声明全局对象和依赖 ---
// 假设 BncrCreateSchema, BncrPluginConfig, sender 在全局可用
let fetch, xml2js; // 依赖将在后面加载

// --- 常量 ---
const DEFAULT_RSS_URLS = []; // 默认留空，请在插件配置中填写自己的 RSS Feed 地址
const DELETE_DELAY_MS = 60 * 1000;
const SELECTION_TIMEOUT_S = 60;
const MAX_RESULTS_TO_SHOW = 15;
const logPrefix = "[博客搜索]"; // 日志前缀

// --- 插件设置界面 Schema 定义 ---
let jsonSchema = null;
let ConfigDB = null;

try {
    // 检查必要的 Bncr 对象是否存在
    if (typeof BncrCreateSchema === 'undefined' || typeof BncrPluginConfig === 'undefined') {
        console.error(`${logPrefix} Bncr 环境缺少 BncrCreateSchema 或 BncrPluginConfig，无法创建设置界面。`);
    } else {
        const BCS = BncrCreateSchema; // 创建别名
        jsonSchema = BCS.object({
            rssUrls: BCS.array(
                    BCS.string().setTitle('RSS Feed 地址')
                    .setDescription('输入一个有效的 RSS/Atom Feed URL。') // 单个地址的描述
                )
                .setTitle('要搜索的 RSS Feed 列表')
                .setDescription('添加或编辑要搜索的博客 RSS/Atom Feed 地址。确保 URL 可访问且格式正确。')
                .setDefault(DEFAULT_RSS_URLS) // 设置默认值
        });

        // 创建配置数据库实例
        ConfigDB = new BncrPluginConfig(jsonSchema);
        console.log(`${logPrefix} 插件设置 Schema 和 ConfigDB 已初始化。`);
    }
} catch (schemaError) {
     console.error(`${logPrefix} 初始化插件设置 Schema 或 ConfigDB 时出错:`, schemaError);
}


// --- 辅助函数：发送消息并设置定时删除 ---
async function replyAndDelete(sender, content, logPrefix = "[博客搜索]", isChoicePrompt = false) {
    let messageId = null;
    try {
        const replyResult = await sender.reply(content);
        // 获取消息 ID
        if (replyResult && typeof replyResult === 'string') messageId = replyResult;
        else if (replyResult?.message_id) messageId = replyResult.message_id;
        else if (replyResult?.id) messageId = replyResult.id;
        else if (replyResult?.data?.message_id) messageId = replyResult.data.message_id;

        if (messageId) {
            const delay = DELETE_DELAY_MS;
            // console.log(`${logPrefix} 消息已发送 (ID: ${messageId}), 设置 ${delay / 1000}s 后删除。`);
            setTimeout(async () => {
                try {
                    await sender.delMsg(messageId);
                    // console.log(`${logPrefix} 消息 (ID: ${messageId}) 已自动删除。`);
                } catch (delErr) {
                    // if (!isChoicePrompt) { console.warn(`${logPrefix} 自动删除消息 (ID: ${messageId}) 失败: ${delErr.message}`); }
                    // else { console.log(`${logPrefix} 尝试删除选择提示消息 (ID: ${messageId})，可能已被用户交互取代。`); }
                }
            }, delay);
        } else {
            console.warn(`${logPrefix} 发送消息后未能获取到可用的消息 ID，无法设置自动删除。返回值为:`, replyResult);
        }
        return messageId;
    } catch (replyErr) {
        console.error(`${logPrefix} 发送消息时出错:`, replyErr);
        return null;
    }
}


// --- 插件主逻辑 ---
const main = async (sender) => {

    // --- 1. 获取用户输入的关键词 ---
    // sender.param(1) will get the keyword from either matched rule
    const keywords = sender.param(1)?.trim();
    if (!keywords) {
        // Provide both command examples in the help message
        await replyAndDelete(sender, '🤔 请输入要搜索的关键词。\n格式: `博客 关键词` 或 `bk 关键词`', logPrefix);
        return;
    }
    console.log(`${logPrefix} 收到搜索关键词: "${keywords}"`);

    // --- 2. 加载依赖 ---
    try {
        await sysMethod.testModule(['node-fetch', 'xml2js'], { install: true });
        xml2js = require('xml2js');
        const fetchModule = await import('node-fetch');
        fetch = fetchModule.default || fetchModule;
        if (typeof fetch !== 'function') throw new Error('无法加载 node-fetch。');
        console.log(`${logPrefix} 依赖加载成功。`);
    } catch (err) {
        console.error(`${logPrefix} 加载依赖失败:`, err);
        let missingModule = '未知模块'; let installCommand = 'npm install <模块名>';
        if (err.code === 'MODULE_NOT_FOUND') {
            const match = err.message.match(/Cannot find module '([^']+)'/);
            missingModule = match?.[1] || 'node-fetch 或 xml2js';
            installCommand = `npm install ${missingModule === '未知模块' ? 'node-fetch xml2js' : missingModule}`;
            const userErrorMessage = `❌ 插件缺少依赖: ${missingModule}\n请进入 Bncr 容器执行:\n\`${installCommand}\`\n然后重启 Bncr 或重载插件。`;
            await replyAndDelete(sender, userErrorMessage, logPrefix);
        } else { await replyAndDelete(sender, `❌ 加载依赖时出错: ${err.message}`, logPrefix); }
        return;
    }

    // --- 3. 获取配置 ---
    let rssUrls = DEFAULT_RSS_URLS; // 先设置默认值
    let CDB = {}; // 用户配置对象

    if (ConfigDB) { // 检查 ConfigDB 是否成功初始化
        try {
            await ConfigDB.get(); // 获取配置
            CDB = ConfigDB.userConfig || {}; // 获取用户配置

            if (!Object.keys(CDB).length && jsonSchema) {
                 console.log(`${logPrefix} 用户尚未配置，提示用户前往Web界面。`);
                 await replyAndDelete(sender, 'ℹ️ 请先到 Web 界面的插件设置中配置 RSS Feed 地址列表。', logPrefix);
                 return;
            }

            if (Array.isArray(CDB.rssUrls) && CDB.rssUrls.length > 0) {
                rssUrls = CDB.rssUrls;
                console.log(`${logPrefix} 从配置中加载了 ${rssUrls.length} 个 RSS 地址。`);
            } else {
                console.warn(`${logPrefix} 配置中未找到有效的 RSS 地址列表，将使用默认地址。请检查插件设置。`);
                 await replyAndDelete(sender, '⚠️ 配置中的 RSS 地址列表无效或为空，将使用默认源。请在插件设置中添加。', logPrefix);
                 rssUrls = DEFAULT_RSS_URLS;
            }
        } catch (dbErr) {
            console.error(`${logPrefix} 获取插件配置失败:`, dbErr);
            await replyAndDelete(sender, `❌ 获取插件配置失败: ${dbErr.message}`, logPrefix);
            return;
        }
    } else {
         console.warn(`${logPrefix} ConfigDB 未初始化，将使用默认 RSS 地址。请检查 Bncr 环境是否支持插件设置界面。`);
    }

    rssUrls = rssUrls.map(url => String(url || '').trim()).filter(url => url.startsWith('http'));
    if (rssUrls.length === 0) {
        console.error(`${logPrefix} 过滤后无有效 RSS 地址。`);
        const msg = ConfigDB ? '❌ 未找到有效的 RSS 地址，请在插件设置中添加。' : '❌ 未找到有效的 RSS 地址 (使用默认值失败)。';
        await replyAndDelete(sender, msg, logPrefix);
        return;
    }
    console.log(`${logPrefix} 将搜索以下 RSS 地址: ${rssUrls.join(', ')}`);


    // --- 4. 发送“处理中”提示 ---
    let workingMsgId = null;
    const searchingMsg = `🔍 正在为 "${keywords}" 在 ${rssUrls.length} 个源中搜索文章，请稍候...`;
    try {
        const workingReply = await sender.reply(searchingMsg);
        if (workingReply && typeof workingReply === 'string') workingMsgId = workingReply;
        else if (workingReply?.message_id) workingMsgId = workingReply.message_id;
        else if (workingReply?.id) workingMsgId = workingReply.id;
        else if (workingReply?.data?.message_id) workingMsgId = workingReply.data.message_id;
        if (workingMsgId) console.log(`${logPrefix} "处理中" 消息ID: ${workingMsgId}`);
        else console.warn(`${logPrefix} 未能获取 "处理中" 消息的 ID。`);
    } catch (e) { console.error(`${logPrefix} 发送 "处理中" 消息失败:`, e); }


    // --- 5. 并发获取和解析所有 RSS Feeds ---
    const flatResults = [];
    const feedErrors = [];
    let feedOrder = {};
    let feedCounter = 0;

    const fetchAndParseFeed = async (url) => {
        console.log(`${logPrefix} 开始处理 Feed: ${url}`);
        try {
            const response = await fetch(url, { timeout: 20000 });
            if (!response.ok) { throw new Error(`状态码 ${response.status}`); }
            const xmlText = await response.text();
            if (!xmlText) { throw new Error('获取到的内容为空'); }

            const parser = new xml2js.Parser({
                explicitArray: false, ignoreAttrs: true, trim: true,
                emptyTag: null, cdata: true // Enable CDATA processing
            });
            const parsed = await parser.parseStringPromise(xmlText);

            const channel = parsed?.rss?.channel;
            if (!channel) { throw new Error('无法解析到有效的 channel 结构'); }

            const feedTitleRaw = channel.title;
            const feedTitle = String( (typeof feedTitleRaw === 'object' && feedTitleRaw?._) ? feedTitleRaw._ : feedTitleRaw || url ).trim();

            const items = channel.item;
            const itemList = Array.isArray(items) ? items : (items ? [items] : []);

            // console.log(`${logPrefix} Feed "${feedTitle}" (${url}) 解析成功，找到 ${itemList.length} 篇文章。`); // Reduced logging noise
            if (!Object.values(feedOrder).some(fo => fo.title === feedTitle)) { feedOrder[feedCounter++] = { title: feedTitle, url: url }; }
            return { feedTitle, items: itemList, url };

        } catch (error) {
            console.error(`${logPrefix} 处理 Feed ${url} 时出错:`, error);
            feedErrors.push({ url: url, error: error.message });
            return null;
        }
    };

    const feedProcessingPromises = rssUrls.map(fetchAndParseFeed);
    const processedFeeds = await Promise.all(feedProcessingPromises);


    // --- 6. 搜索关键词并整理到扁平列表 ---
    console.log(`${logPrefix} 所有 Feed 处理完成，开始匹配关键词并整理结果...`);
    const keywordsLower = keywords.toLowerCase();
    const stripHtml = (html) => html ? String(html).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim() : '';
    let totalMatches = 0;

    for (let i = 0; i < feedCounter; i++) {
        const feedInfo = feedOrder[i];
        const processed = processedFeeds.find(p => p && p.url === feedInfo.url);
        if (!processed) continue;

        const { feedTitle, items } = processed;
        items.forEach(item => {
            const titleRaw = item?.title;
            const title = String( (typeof titleRaw === 'object' && titleRaw?._) ? titleRaw._ : titleRaw || '' ).trim();
            const link = String(item?.link || '');
            let contentSourceRaw = item?.description || item?.['content:encoded'] || item?.content;
            let contentText = '';
            if (typeof contentSourceRaw === 'object' && contentSourceRaw?._) contentText = contentSourceRaw._;
            else if (typeof contentSourceRaw === 'string') contentText = contentSourceRaw;
            const descriptionText = stripHtml(contentText);

            if (link && title && (title.toLowerCase().includes(keywordsLower) || descriptionText.toLowerCase().includes(keywordsLower))) {
                 flatResults.push({ feed: feedTitle, title: title, link: link });
                 totalMatches++;
            }
        });
    }
    console.log(`${logPrefix} 关键词匹配完成，总共找到 ${totalMatches} 篇相关文章。`);


    // --- 7. 清理“处理中”消息 (延迟删除) ---
    if (workingMsgId) { setTimeout(async () => { try { await sender.delMsg(workingMsgId); } catch (delErr) { console.warn(`${logPrefix} 自动删除 "处理中" 消息失败: ${delErr.message}`); } }, DELETE_DELAY_MS); }


    // --- 8. 根据搜索结果进行回复 ---
    try {
        if (totalMatches === 0) {
            let replyText = `😅 未在配置的源中找到与 "${keywords}" 相关的文章。`;
            if (feedErrors.length > 0) { replyText += `\n⚠️ 部分源搜索失败：\n`; feedErrors.forEach(err => replyText += `- ${err.url} (${err.error})\n`); }
            await replyAndDelete(sender, replyText.trim(), logPrefix);

        } else if (totalMatches === 1) {
            const result = flatResults[0];
            let replyText = `✅ 找到 1 篇文章：\n\n--- ${result.feed} ---\n📄 ${result.title}\n🔗 ${result.link}`;
            if (feedErrors.length > 0) { replyText += `\n\n⚠️ 部分源搜索失败：\n`; feedErrors.forEach(err => replyText += `- ${err.url} (${err.error})\n`); }
            await replyAndDelete(sender, replyText.trim(), logPrefix);

        } else {
            let replyText = `✅ 找到 ${totalMatches} 篇相关文章，请输入序号选择：\n`;
            let currentFeedTitle = null;
            const resultsToShow = flatResults.slice(0, MAX_RESULTS_TO_SHOW);
            resultsToShow.forEach((result, index) => {
                if (result.feed !== currentFeedTitle) { replyText += `\n--- ${result.feed} ---\n`; currentFeedTitle = result.feed; }
                replyText += `${index + 1}. ${result.title}\n`;
            });
            if (flatResults.length > MAX_RESULTS_TO_SHOW) { replyText += `\n(仅显示前 ${MAX_RESULTS_TO_SHOW} 条结果)`; }
            replyText += `\n请在 ${SELECTION_TIMEOUT_S} 秒内回复序号 (回复 q 或 取消 退出)。`;

            const choicePromptMsgId = await replyAndDelete(sender, replyText, logPrefix, true);

            const userChoiceSender = await sender.waitInput(async (s) => {
                const input = s.getMsg()?.trim(); if (!input) return await s.again('🤔 输入不能为空...'); const lowerInput = input.toLowerCase(); if (lowerInput === 'q' || lowerInput === '取消') return; const choiceIndex = parseInt(input, 10); if (isNaN(choiceIndex) || choiceIndex < 1 || choiceIndex > resultsToShow.length) { return await s.again(`🙁 无效序号...`); }
            }, SELECTION_TIMEOUT_S);

            if (userChoiceSender === null) {
                await replyAndDelete(sender, '⏳ 超时未选择...', logPrefix); console.log(`${logPrefix} 用户选择超时。`);
            } else {
                const finalInput = userChoiceSender.getMsg()?.trim(); const finalLowerInput = finalInput.toLowerCase();
                if (finalLowerInput === 'q' || finalLowerInput === '取消') {
                    await replyAndDelete(sender, '👌 已取消选择。', logPrefix); console.log(`${logPrefix} 用户主动取消选择。`);
                } else {
                    const selectedIndex = parseInt(finalInput, 10) - 1;
                    if (selectedIndex >= 0 && selectedIndex < resultsToShow.length) {
                        const selectedArticle = resultsToShow[selectedIndex];
                        const finalArticleReply = `您选择了 ${selectedIndex + 1}：\n\n--- ${selectedArticle.feed} ---\n📄 ${selectedArticle.title}\n🔗 ${selectedArticle.link}`;
                        await replyAndDelete(sender, finalArticleReply, logPrefix);
                        console.log(`${logPrefix} 用户选择了第 ${selectedIndex + 1} 项，已发送链接。`);
                        try { const userChoiceMsgId = userChoiceSender.getMsgId(); if (userChoiceMsgId) { await sender.delMsg(userChoiceMsgId); console.log(`${logPrefix} 已删除用户选择消息 ${userChoiceMsgId}`);}
                        } catch (delErr) { console.warn(`${logPrefix} 删除用户选择消息失败: ${delErr.message}`);}
                    } else { await replyAndDelete(sender, '🙁 处理选择时出错。', logPrefix); }
                }
            }
        }
    } catch (replyError) {
         console.error(`${logPrefix} 发送最终回复时出错:`, replyError);
         try { await replyAndDelete(sender, '🙁 发送结果时遇到问题。', logPrefix); } catch {}
    }

    console.log(`${logPrefix} 插件执行完毕。`);
};


// --- 导出 ---
module.exports = main; // 导出主函数
// 如果 Schema 和 ConfigDB 成功初始化，则导出 Schema
if (jsonSchema && ConfigDB) {
    module.exports.jsonSchema = jsonSchema;
}

