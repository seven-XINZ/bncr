/**
 * @author seven
 * @name 星座运势
 * @team xinz
 * @version 1.0.9
 * @description 星座运势插件，通过自定义API接口获取星座运势并自动匹配   自用接口https://api.vvhan.com/api/horoscope
 * @rule ^(星座) (.+) (今日运势|明日运势|一周运势|月运势)$
 * @rule ^(今日运势|明日运势|一周运势|月运势) (.+)$
 * @priority 99999
 * @admin false
 * @public true
 * @classification ["工具"]
 * @disable false
 */

const axios = require('axios');

const jsonSchema = BncrCreateSchema.object({
  apiUrl: BncrCreateSchema.string()
    .setTitle('自定义API接口')
    .setDescription('设置用于获取星座运势的API接口')
    .setDefault('https://api.vvhan.com/api/horoscope')
});

// 配置管理器
const ConfigDB = new BncrPluginConfig(jsonSchema);

module.exports = async s => {
  console.log('星座运势插件已加载');

  await sysMethod.testModule(['axios'], { install: true });
  await ConfigDB.get();

  const userConfig = ConfigDB.userConfig;
  if (!Object.keys(userConfig).length) {
    return s.reply('请先前往前端web界面配置插件。');
  }

  const apiUrl = userConfig.apiUrl || 'https://api.vvhan.com/api/horoscope';

  // 解析命令
  const command = s.param(3) || s.param(2); // 获取用户输入的命令
  const starSign = s.param(2) || s.param(1); // 获取用户输入的星座
  const isCustomCommand = ['今日运势', '明日运势', '一周运势', '月运势'].includes(command);

  console.log(`获取的命令: ${command}, 星座: ${starSign}`);

  // 星座与对应英文小写的映射
  const starSignsMap = {
    '白羊座': 'aries',
    '金牛座': 'taurus',
    '双子座': 'gemini',
    '巨蟹座': 'cancer',
    '狮子座': 'leo',
    '处女座': 'virgo',
    '天秤座': 'libra',
    '天蝎座': 'scorpio',
    '射手座': 'sagittarius',
    '摩羯座': 'capricorn',
    '水瓶座': 'aquarius',
    '双鱼座': 'pisces'
  };

  // 运势类型映射
  const timeMap = {
    '今日运势': 'today',
    '明日运势': 'nextday',
    '一周运势': 'week',
    '月运势': 'month'
  };

  // 检查星座的有效性
  if (!Object.keys(starSignsMap).includes(starSign)) {
    return s.reply('请提供有效的星座。');
  }

  const type = starSignsMap[starSign];

  // 存储运势结果
  let results = [];

  try {
    // 处理命令
    if (isCustomCommand) {
      const time = timeMap[command];

      const response = await axios.get(apiUrl, {
        params: {
          type: type,
          time: time
        }
      });

      console.log(`API 响应 (${command}):`, response.data);

      // 处理 API 响应
      if (response.data.success) {
        const fortuneData = response.data.data;

        if (fortuneData) {
          const title = fortuneData.title;
          const time = fortuneData.time;
          const shortComment = fortuneData.shortcomment || "暂无简要信息";
          const fortuneText = fortuneData.fortunetext.all || "暂无详细信息";

          results.push(`**${title}的${command}**:\n时间: ${time}\n简要: ${shortComment}\n详细: ${fortuneText}`);
        } else {
          results.push(`**${command}**: 暂无内容`);
        }
      } else {
        results.push(`抱歉，无法获取${command}。`);
      }
    } else {
      // 如果是单独的运势命令, 例如 "今日运势 双鱼座"
      const time = timeMap[command];

      const response = await axios.get(apiUrl, {
        params: {
          type: starSignsMap[starSign],
          time: time
        }
      });

      console.log(`API 响应 (${command}):`, response.data);

      // 处理 API 响应
      if (response.data.success) {
        const fortuneData = response.data.data;

        if (fortuneData) {
          const title = fortuneData.title;
          const time = fortuneData.time;
          const shortComment = fortuneData.shortcomment || "暂无简要信息";
          const fortuneText = fortuneData.fortunetext.all || "暂无详细信息";

          results.push(`**${title}的${command}**:\n时间: ${time}\n简要: ${shortComment}\n详细: ${fortuneText}`);
        } else {
          results.push(`**${command}**: 暂无内容`);
        }
      } else {
        results.push(`抱歉，无法获取${command}。`);
      }
    }

    // 返回所有运势结果
    await s.reply(results.join('\n\n'));
  } catch (error) {
    console.error('发生错误:', error);
    await s.reply('抱歉，发生了错误，请稍后再试。');
  }
};
