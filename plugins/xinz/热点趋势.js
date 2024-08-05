/**
 * @author Dswang
 * @name 热点趋势
 * @team xinz & SmartAI
 * @version 1.0.1
 * @description 获取网络热点
 * @platform tgBot qq ssh HumanTG wxQianxun wxXyo wechaty
 * @rule ^((抖音|微博|知乎|bilibili|bili|哔哩|哔哩哔哩)热搜)$
 * @admin false
 * @public true
 * @priority 9999
 * @classification ["工具"]
 */

const axios = require('axios');

module.exports = async s => {
  await sysMethod.testModule(['axios', 'input'], { install: true });

  const apiEndpoints = {
    '抖音热搜': 'https://tenapi.cn/v2/douyinhot',
    '微博热搜': 'https://tenapi.cn/v2/weibohot',
    '知乎热搜': 'https://tenapi.cn/v2/zhihuhot',
    'bilibili热搜': 'https://tenapi.cn/v2/bilihot',
    'bili热搜': 'https://tenapi.cn/v2/bilihot',
    '哔哩热搜': 'https://tenapi.cn/v2/bilihot',
    '哔哩哔哩热搜': 'https://tenapi.cn/v2/bilihot'
  };

  const platform = s.getMsg().match(/(抖音|微博|知乎|bilibili|bili|哔哩|哔哩哔哩)热搜/)[0];
  const apiUrl = apiEndpoints[platform];

  if (!apiUrl) {
    await s.reply('不支持的平台');
    return;
  }

  try {
    // 调用接口获取热搜数据
    const response = await axios.get(apiUrl);

    // 检查响应数据是否有效
    if (response.data.code !== 200 || !response.data.data) {
      throw new Error('无效的响应数据');
    }

    const hotList = response.data.data;

    // 只取前10条数据
    const top10HotList = hotList.slice(0, 10);

    // 格式化输出消息
    let replyMessage = `${platform}前10名：\n`;

    top10HotList.forEach((item, index) => {
      // 检查是否有热度数据
      if (item.hot) {
        replyMessage += `${index + 1}. 热搜词：${item.name}\n热度：${item.hot}\n链接：${item.url}\n\n`;
      } else {
        replyMessage += `${index + 1}. 热搜词：${item.name}\n链接：${item.url}\n\n`;
      }
    });

    // 回复消息给用户
    await s.reply(replyMessage);
  } catch (error) {
    await s.reply('获取热搜失败，请稍后再试。');
    console.error(error);
  }
};
