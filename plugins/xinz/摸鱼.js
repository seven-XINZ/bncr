/**
 * @author Dswang
 * @name 摸鱼
 * @team xinz
 * @version 1.0.1
 * @description 摸鱼人日历，可以自定义接口 自用接口 https://api.vvhan.com/api/moyu
 * @rule ^(摸鱼)$
 * @priority 99999
 * @admin false
 * @public true
 * @classification ["工具"]
 * @disable false
 */
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const jsonSchema = BncrCreateSchema.object({
  apiUrl: BncrCreateSchema.string()
    .setTitle('自定义API接口')
    .setDescription('设置用于生成摸鱼的API接口')
    .setDefault('https://api.vvhan.com/api/moyu')
});

const ConfigDB = new BncrPluginConfig(jsonSchema);

module.exports = async s => {
  await sysMethod.testModule(['axios'], { install: true });
  await ConfigDB.get();

  const userConfig = ConfigDB.userConfig;
  if (!Object.keys(userConfig).length) {
    return s.reply('请先前往前端web界面配置插件。');
  }

  const apiUrl = userConfig.apiUrl || 'https://api.vvhan.com/api/moyu';

  const today = new Date().toISOString().split('T')[0]; // 获取当前日期
  const filePath = path.join(process.cwd(), `BncrData/public/moyu_${today}.png`); // 使用 PNG 格式

  // 检查当天的文件是否已经存在
  if (fs.existsSync(filePath)) {
    // 文件存在，直接发送
    if (s.getFrom() === 'tgBot' || s.getFrom() === 'HumanTG') {
      await s.reply({
        type: 'image',
        path: filePath, // 发送本地文件路径
        options: {
          contentType: 'image/png' // 设置 content-type 为 PNG
        }
      });
    } else {
      await s.reply({
        type: 'image',
        path: apiUrl
      });
    }
  } else {
    // 文件不存在，重新生成并保存
    try {
      const response = await axios.get(apiUrl, { responseType: 'stream' });

      const writer = fs.createWriteStream(filePath);

      response.data.pipe(writer);

      writer.on('finish', async () => {
        const imageUrl = response.request.res.responseUrl;

        if (s.getFrom() === 'tgBot' || s.getFrom() === 'HumanTG') {
          await s.reply({
            type: 'image',
            path: filePath, // 发送本地文件路径
            options: {
              contentType: 'image/png' // 设置 content-type 为 PNG
            }
          });
        } else {
          await s.reply({
            type: 'image',
            path: imageUrl // 直接使用响应URL
          });
        }

        // 删除前一天的文件
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]; // 获取前一天日期
        const oldFilePath = path.join(process.cwd(), `BncrData/public/moyu_${yesterday}.png`);
        if (fs.existsSync(oldFilePath)) {
          fs.unlink(oldFilePath, (err) => {
            if (err) {
              console.error('删除文件时发生错误:', err);
            }
          });
        }
      });

      writer.on('error', async (err) => {
        console.error('写入文件时发生错误:', err);
        await s.reply('抱歉，发生了错误，请稍后再试。');
      });
    } catch (error) {
      if (error.code === 'EAI_AGAIN') {
        await s.reply('无法连接到摸鱼图片生成服务，请检查网络连接或稍后再试。');
      } else {
        console.error('发生错误:', error);
        await s.reply('抱歉，发生了错误，请稍后再试。');
      }
    }
  }
};
