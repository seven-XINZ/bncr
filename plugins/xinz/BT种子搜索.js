/**
 * @author seven
 * @name BT种子搜索
 * @team xinz
 * @description 自动在 Jackett 模糊搜索 BT 种子并输出结果；Jackett 地址与 API Key 在插件配置中填写
 * @rule ^bt (.+)$
 * @admin true
 * @public false
 * @priority 99
 * @disable false
 * @version 2.0.0
 * @license MIT
 * @repo https://github.com/seven-XINZ/bncr
 * @platform qq tgBot wxClawBot wxQianxun wxXyo HumanTG web ssh
 * @updated 2026-11-28
 * @classification ["工具"]
 */

// 引入 axios 库，用于发送 HTTP 请求
const axios = require('axios');
// 引入 xml2js 库，用于解析 XML 格式的响应
sysMethod.testModule(['xml2js'], { install: true });
const xml2js = require('xml2js');

/* 配置：Jackett 地址与密钥由用户在面板填写，源码不留明文 */
const jsonSchema = BncrCreateSchema.object({
    jackettUrl: BncrCreateSchema.string()
        .setTitle('Jackett 地址')
        .setDescription('Jackett torznab 接口地址，例如 http://127.0.0.1:9117/api/v2.0/indexers/all/results/torznab')
        .setDefault(''),
    apiKey: BncrCreateSchema.string()
        .setTitle('Jackett API Key')
        .setDescription('在 Jackett 后台复制的 API Key')
        .setDefault('')
});

const ConfigDB = new BncrPluginConfig(jsonSchema);

// 将字节转换为 G 的函数
function formatFileSize(sizeInBytes) {
    const sizeInGB = sizeInBytes / (1024 * 1024 * 1024); // 转换为 G
    if (sizeInGB < 1) {
        return sizeInGB.toFixed(1) + ' G'; // 不足1G时保留一位小数
    } else if (sizeInGB < 10) {
        return (Math.floor(sizeInGB * 10) / 10).toFixed(1) + ' G'; // 大于1G小于10G时保留一位小数
    } else {
        return Math.floor(sizeInGB) + ' G'; // 大于等于10G时取整
    }
}

// 导出一个异步函数，接收 sender 作为参数
module.exports = async sender => {
    await ConfigDB.get();

    const { jackettUrl, apiKey } = ConfigDB.userConfig;
    if (!jackettUrl || !apiKey) {
        return await sender.reply('请先在插件配置中填写 Jackett 地址与 API Key。');
    }

    // 从 sender 中获取搜索关键词，并去掉多余的空格
    const searchQuery = sender.param(1).trim();
    console.log(`搜索关键词: ${searchQuery}`); // 输出搜索关键词到控制台

    // 将关键词按空格分割为数组，并使用通配符进行模糊搜索
    const keywords = searchQuery.split(' ').map(keyword => `*${keyword}*`).join(' AND '); // 使用AND连接多个关键词

    try {
        // 发送 GET 请求到 Jackett API
        const response = await axios.get(jackettUrl, {
            params: {
                apikey: apiKey, // API密钥
                t: 'search', // 搜索类型
                q: keywords, // 使用AND连接的关键词
                cat: '2000', // 指定类别
            },
            headers: {
                // 设置请求头中的 User-Agent
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3'
            }
        });

        console.log('API 响应:', response.data); // 输出API响应到控制台

        // 解析 XML 格式的响应
        const result = await new Promise((resolve, reject) => {
            xml2js.parseString(response.data, (err, parsed) => {
                if (err) {
                    reject(err); // 如果解析出错，拒绝Promise
                } else {
                    resolve(parsed); // 否则，解析成功，解决Promise
                }
            });
        });

        // 获取 RSS 频道中的所有项
        const items = result.rss.channel[0].item;
        // 检查是否有搜索结果
        if (!items || items.length === 0) {
            await sender.reply(`未找到与 "${searchQuery}" 相关的种子。`); // 如果没有结果，回复提示信息
            return; // 结束函数
        }

        // 只获取前 20 个结果
        const limitedResults = items.slice(0, 20);

        // 将结果分为每组 10 个进行处理
        for (let i = 0; i < limitedResults.length; i += 10) {
            let output = '公告: BT种子搜索结果\n\n'; // 组标题

            // 处理每组的 10 个结果
            const group = limitedResults.slice(i, i + 10);
            group.forEach(item => {
                const title = item.title[0]; // 文件名
                const magnetLink = item.link[0]; // 磁力链接
                const sizeInBytes = parseInt(item.size[0], 10); // 文件大小（字节）
                const pubDate = item.pubDate[0]; // 创建日期

                // 格式化输出结果
                output += `文件名: ${title}\n`;
                output += `   文件大小: ${formatFileSize(sizeInBytes)}\n`;
                output += `   创建日期: ${pubDate}\n`;
                output += `   链接: ${magnetLink}\n`;
                output += `---------------------------\n`;
            });

            // 发送当前组的结果
            await sender.reply(output);
        }
    } catch (error) {
        console.error('搜索过程中发生错误:', error); // 输出错误信息到控制台
        await sender.reply('在搜索过程中发生错误，请稍后再试。'); // 回复错误提示
    }
};
