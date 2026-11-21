/**
 * @author OpenClaw
 * @name 智能搜索
 * @team xinz
 * @origin 实用工具
 * @version 1.0.1
 * @description 支持多种搜索引擎：百度、谷歌、必应、B 站、知乎等
 * @platform tgBot qqBot wxKeAImao wxQianxun
 * @rule ^(搜索 | 搜一下) (.+)$
 * @rule ^(百度 | 谷歌 | 必应|B 站 | 知乎 | 微博 | 抖音) 搜索 (.+)$
 * @priority 100
 * @disable false
 * @admin false
 * @public false
 */


const jsonSchema = BncrCreateSchema.object({
    resultLimit: BncrCreateSchema.number().setTitle('结果条数').setDefault(5),
    searchApi: BncrCreateSchema.string().setTitle('搜索接口').setDescription('留空则只返回各引擎搜索链接；接口需返回 JSON 数组或 {data:[...]}').setDefault('')
});
const ConfigDB = new BncrPluginConfig(jsonSchema);

module.exports = async sender => {
    await ConfigDB.get();
    const cfg = ConfigDB.userConfig || {};
    const resultLimit = Number(cfg.resultLimit) || 5;
    const searchApi = cfg.searchApi || '';
    const cmd = sender.getMsg();
    const keywords = extractKeywords(cmd);
    
    if (!keywords) {
        await sender.reply('❌ 请输入要搜索的内容\n例如：\n• 搜索 怎么做红烧肉\n• 百度搜索 JavaScript 教程\n• B 站搜索 原神\n• 知乎搜索 人工智能');
        return;
    }
    
    const engine = detectEngine(cmd);
    const results = searchApi ? await search(engine, keywords, searchApi, resultLimit) : { data: [], linkOnly: true };
    
    if (results.error) {
        await sender.reply(`❌ 搜索失败：${results.error}`);
        return;
    }
    if (results.linkOnly) {
        await sender.reply(`🔍 ${getEngineName(engine)}搜索：${keywords}\n${engineUrl(engine, keywords)}`);
        return;
    }
    
    // 格式化搜索结果
    let replyMsg = `🔍 搜索结果（${getEngineName(engine)}）:\n\n`;
    
    results.data.slice(0, resultLimit).forEach((item, index) => {
        replyMsg += `${index + 1}. ${item.title}\n   ${item.url}\n   ${item.snippet}\n\n`;
    });
    
    await sender.reply(replyMsg);
};

function extractKeywords(cmd) {
    const patterns = [
        /^(搜索 | 搜一下)\s+(.+)/,
        /^(百度 | 谷歌 | 必应|B 站 | 知乎 | 微博 | 抖音)\s+搜索\s+(.+)/
    ];
    
    for (const pattern of patterns) {
        const match = cmd.match(pattern);
        if (match) {
            return match[2].trim();
        }
    }
    return null;
}

function detectEngine(cmd) {
    if (cmd.includes('百度')) return 'baidu';
    if (cmd.includes('谷歌') || cmd.includes('google')) return 'google';
    if (cmd.includes('必应') || cmd.includes('bing')) return 'bing';
    if (cmd.includes('B 站') || cmd.includes('bilibili')) return 'bilibili';
    if (cmd.includes('知乎')) return 'zhihu';
    if (cmd.includes('微博')) return 'weibo';
    if (cmd.includes('抖音')) return 'douyin';
    return 'baidu'; // 默认百度
}

function getEngineName(engine) {
    const names = {
        baidu: '百度',
        google: '谷歌',
        bing: '必应',
        bilibili: 'B 站',
        zhihu: '知乎',
        weibo: '微博',
        douyin: '抖音'
    };
    return names[engine] || '搜索';
}

function engineUrl(engine, keywords) {
    const q = encodeURIComponent(keywords);
    const map = {
        baidu: `https://www.baidu.com/s?wd=${q}`,
        google: `https://www.google.com/search?q=${q}`,
        bing: `https://www.bing.com/search?q=${q}`,
        bilibili: `https://search.bilibili.com/all?keyword=${q}`,
        zhihu: `https://www.zhihu.com/search?type=content&q=${q}`,
        weibo: `https://s.weibo.com/weibo?q=${q}`,
        douyin: `https://www.douyin.com/search/${q}`,
    };
    return map[engine] || map.baidu;
}

async function search(engine, keywords, api, limit) {
    try {
        const url = `${api}${api.includes('?') ? '&' : '?'}q=${encodeURIComponent(keywords)}&limit=${limit}`;
        const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (!resp.ok) throw new Error(`搜索接口 HTTP ${resp.status}`);
        const json = await resp.json();
        const list = Array.isArray(json) ? json : (json.data || json.results || []);
        return {
            data: list.map(item => ({
                title: item.title || item.name || '',
                url: item.url || item.link || '',
                snippet: item.snippet || item.content || item.description || '',
            })).filter(item => item.url).slice(0, limit)
        };
    } catch (error) {
        return { error: error.message, data: [] };
    }
}
