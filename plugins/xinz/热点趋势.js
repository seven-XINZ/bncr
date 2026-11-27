/**
 * @author Dswang
 * @name 热点趋势
 * @team xinz & SmartAI
 * @version 1.1.0
 * @description 获取网络热点（微博走官方榜单接口，其余平台走第三方，失效时明确提示）
 * @platform tgBot qq ssh HumanTG wxQianxun wxXyo wechaty wxClawBot
 * @rule ^((抖音|微博|知乎|bilibili|bili|哔哩|哔哩哔哩)热搜)$
 * @admin false
 * @public false
 * @priority 9999
 * @classification ["工具"]
 */
const axios = require('axios');

const jsonSchema = BncrCreateSchema.object({
    apiBase: BncrCreateSchema.string().setTitle('第三方接口地址').setDefault('https://tenapi.cn/v2'),
});
const ConfigDB = new BncrPluginConfig(jsonSchema);

const WEIBO_BAND = 'https://weibo.com/ajax/statuses/hot_band';

async function weiboHot() {
    const r = await axios.get(WEIBO_BAND, {
        timeout: 10000,
        headers: {
            Referer: 'https://weibo.com/',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        },
    });
    const list = (((r.data || {}).data || {}).band_list) || [];
    if (!list.length) throw new Error('官方榜单为空');
    return list.slice(0, 10).map((it, i) => `${i + 1}. ${it.word}${it.num ? '（' + it.num + '）' : ''}`);
}

module.exports = async s => {
    await ConfigDB.get();
    const apiBase = ((ConfigDB.userConfig || {}).apiBase || 'https://tenapi.cn/v2').replace(/\/+$/, '');
    const m = String(s.getMsg() || '').match(/(抖音|微博|知乎|bilibili|bili|哔哩|哔哩哔哩)热搜/);
    if (!m) return s.reply('不支持的平台，试试：微博热搜 / 抖音热搜 / 知乎热搜 / bilibili热搜');
    const platform = m[0];

    if (platform.includes('微博')) {
        try {
            const lines = await weiboHot();
            return s.reply(`${platform}前10名：\n${lines.join('\n')}`);
        } catch (e) {
            console.warn('[热点趋势] 微博官方接口失败，回退第三方:', e.message);
        }
    }

    const map = {
        抖音热搜: `${apiBase}/douyinhot`,
        微博热搜: `${apiBase}/weibohot`,
        知乎热搜: `${apiBase}/zhihuhot`,
        'bilibili热搜': `${apiBase}/bilihot`,
        'bili热搜': `${apiBase}/bilihot`,
        哔哩热搜: `${apiBase}/bilihot`,
        哔哩哔哩热搜: `${apiBase}/bilihot`,
    };
    const url = map[platform];
    if (!url) return s.reply('不支持的平台');

    try {
        const r = await axios.get(url, { timeout: 10000 });
        const d = r.data || {};
        if (d.code !== 200 || !Array.isArray(d.data) || !d.data.length) throw new Error('第三方接口无数据');
        const lines = d.data.slice(0, 10).map((it, i) => `${i + 1}. ${it.name}${it.hot ? '（' + it.hot + '）' : ''}`);
        return s.reply(`${platform}前10名：\n${lines.join('\n')}`);
    } catch (e) {
        console.warn('[热点趋势] 接口失败:', e.message);
        return s.reply(`${platform}暂时取不到，第三方接口大概率已停服，可以在插件配置里换 apiBase。`);
    }
};
