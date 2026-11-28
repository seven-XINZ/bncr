/**
 * @author seven
 * @name 每天60秒读懂世界
 * @team xinz
 * @version 1.0.1
 * @description 每天60秒读懂世界，数据来源 https://www.jun.la/
 * @rule ^(60s|每日60)$
 * @admin false
 * @public false
 * @priority 999
 * @disable false
 */
sysMethod.testModule(['cheerio'], { install: true });

const axios = require('axios');
const cheerio = require('cheerio');

const SOURCE = 'https://www.jun.la/';
const TIMEOUT = 15000;

async function fetchText(url) {
    const res = await axios.get(url, {
        timeout: TIMEOUT,
        responseType: 'text',
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BncrBot/1.0)' },
    });
    return res.data;
}

/** 文章列表 */
async function getList() {
    const html = await fetchText(`${SOURCE}60snews/`);
    const $ = cheerio.load(html);
    return $('article')
        .map((i, el) => {
            const item = $(el);
            return {
                title: item.find('h2.entry-title a').text().trim(),
                link: item.find('h2.entry-title a').attr('href'),
                date: `${item.find('.date').text()}${item.find('.timeline-time').text()}`.replace(/\s+/g, ' ').trim(),
            };
        })
        .get()
        .filter((x) => x.link);
}

/** 单篇文章正文 */
async function getContent(link) {
    const html = await fetchText(link);
    const $ = cheerio.load(html);
    const container = $('.single-content');
    return {
        title: $('.entry-title').text().trim(),
        thumb: container.find('section p img').attr('src') || '',
        content: container
            .find('section section p')
            .map((i, el) => $(el).find('span').text().trim())
            .get()
            .filter(Boolean),
    };
}

/** 备用页面：news.html */
async function getBackup() {
    const html = await fetchText(`${SOURCE}news.html/`);
    const $ = cheerio.load(html);
    const container = $('.entry-content');
    const pick = (label) => container.find(`p:contains("${label}")`).text().replace(`${label}：`, '').trim();
    return {
        title: pick('简报标题'),
        thumb: pick('简报图片'),
        openURL: pick('简报长文图片'),
        content: container.find('p').slice(6).map((i, el) => $(el).text().trim()).get().filter(Boolean),
    };
}

function formatMessage(title, content, openURL, thumb) {
    const lines = [`📰 ${title || '每天60秒读懂世界'}`, ''];
    content.forEach((line) => lines.push(line));
    if (openURL) lines.push('', `🔗 长图：${openURL}`);
    if (thumb) lines.push(`🖼 配图：${thumb}`);
    return lines.join('\n');
}

module.exports = async (sender) => {
    let data;
    try {
        const list = await getList();
        data = list.length ? await getContent(list[0].link) : await getBackup();
    } catch (e) {
        try {
            data = await getBackup();
        } catch (e2) {
            console.error('[60s] 抓取失败:', e.message, '| 备用失败:', e2.message);
            return sender.reply('❌ 60s 数据源暂时不可用，请稍后再试。');
        }
    }

    return sender.reply(formatMessage(data.title, data.content, data.openURL, data.thumb));
};
