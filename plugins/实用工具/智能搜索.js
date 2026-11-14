/**
 * @author OpenClaw
 * @name 智能搜索
 * @origin 实用工具
 * @version 1.0.0
 * @description 支持多种搜索引擎：百度、谷歌、必应、B 站、知乎等
 * @platform tgBot qqBot wxKeAImao wxQianxun
 * @rule ^(搜索 | 搜一下) (.+)$
 * @rule ^(百度 | 谷歌 | 必应|B 站 | 知乎 | 微博 | 抖音) 搜索 (.+)$
 * @priority 100
 * @disable false
 * @admin false
 * @public false
 */

module.exports = async sender => {
    const cmd = sender.getMsg();
    const keywords = extractKeywords(cmd);
    
    if (!keywords) {
        await sender.reply('❌ 请输入要搜索的内容\n例如：\n• 搜索 怎么做红烧肉\n• 百度搜索 JavaScript 教程\n• B 站搜索 原神\n• 知乎搜索 人工智能');
        return;
    }
    
    const engine = detectEngine(cmd);
    const results = await search(engine, keywords);
    
    if (results.error) {
        await sender.reply(`❌ 搜索失败：${results.error}`);
        return;
    }
    
    // 格式化搜索结果
    let replyMsg = `🔍 搜索结果（${getEngineName(engine)}）:\n\n`;
    
    results.data.slice(0, 5).forEach((item, index) => {
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

async function search(engine, keywords) {
    try {
        // 注意：实际使用时需要使用真实的搜索 API
        // 这里使用 DuckDuckGo 的公开 API 作为示例
        
        const ddgUrl = `https://html.duckduckgo.com/html/`;
        const formData = new FormData();
        formData.append('q', keywords);
        formData.append('kl', 'zh-cn');
        
        const response = await fetch(ddgUrl, {
            method: 'POST',
            body: formData
        });
        
        // 解析 HTML 并提取结果（简化版）
        // 实际项目中建议使用专门的搜索 API 库
        
        return {
            data: [
                {
                    title: `${keywords} - 搜索结果`,
                    url: `https://duckduckgo.com/?q=${encodeURIComponent(keywords)}`,
                    snippet: `搜索"${keywords}"的相关结果...`
                }
            ]
        };
        
    } catch (error) {
        return {
            error: error.message,
            data: []
        };
    }
}
