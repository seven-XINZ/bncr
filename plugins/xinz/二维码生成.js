/**
 * @author seven
 * @name 二维码生成
 * @team xinz
 * @version 1.0.1
 * @description 二维码生成插件，通过自定义的API接口生成二维码
 * @rule ^(二维码生成) (.+)$
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
    .setDescription('设置用于生成二维码的API接口')
    .setDefault('https://api.vvhan.com/api/qr')
});

const ConfigDB = new BncrPluginConfig(jsonSchema);

module.exports = async s => {
  await sysMethod.testModule(['axios'], { install: true });
  await ConfigDB.get();

  const userConfig = ConfigDB.userConfig;
  if (!Object.keys(userConfig).length) {
    return s.reply('请先前往前端web界面配置插件。');
  }

  const apiUrl = userConfig.apiUrl || 'https://api.vvhan.com/api/qr';
  const textToEncode = s.param(2);

  try {
    const response = await axios.get(apiUrl, {
      params: {
        text: textToEncode
      },
      responseType: 'stream' // 确保接收的是图片数据流
    });

    const filePath = path.join(process.cwd(), `BncrData/public/qrcode_${Date.now()}.jpg`);
    const writer = fs.createWriteStream(filePath);

    response.data.pipe(writer);

    writer.on('finish', async () => {
      if (s.getFrom() === 'tgBot' || s.getFrom() === 'HumanTG') {
        await s.reply({
          type: 'image',
          path: filePath, // 发送本地文件路径
          options: {
            contentType: 'image/jpeg'
          }
        });
      } else {
        await s.reply({
          type: 'image',
          path: response.request.res.responseUrl // 直接使用响应URL
        });
      }
      
      // 删除本地文件
      fs.unlink(filePath, (err) => {
        if (err) {
          console.error('删除文件时发生错误:', err);
        }
      });
    });

    writer.on('error', async (err) => {
      console.error('写入文件时发生错误:', err);
      await s.reply('抱歉，发生了错误，请稍后再试。');
    });
  } catch (error) {
    if (error.code === 'EAI_AGAIN') {
      await s.reply('无法连接到二维码生成服务，请检查网络连接或稍后再试。');
    } else {
      console.error('发生错误:', error);
      await s.reply('抱歉，发生了错误，请稍后再试。');
    }
  }
};
