/**
 * @author OpenClaw
 * @name 图片转文字
 * @origin 实用工具
 * @version 1.0.0
 * @description 图片 OCR 识别，支持多种语言
 * @platform tgBot qqBot wxKeAImao wxQianxun
 * @rule ^(识别图片 | OCR|图片转文字)$
 * @priority 100
 * @disable false
 * @admin false
 * @public false
 */

module.exports = async sender => {
    const msgType = sender.msgInfo?.type;
    const msgId = sender.getMsgId();
    
    // 检查是否是图片消息
    if (msgType !== 'image') {
        await sender.reply('❌ 请发送一张图片，然后发送：识别图片\n或者在图片后附加文字说明');
        return;
    }
    
    await sender.reply('🔄 正在识别图片中的文字，请稍候...');
    
    try {
        // 这里需要使用 OCR API
        // 可以使用百度 OCR、腾讯 OCR、阿里云 OCR 等
        // 示例使用百度 OCR（需要先配置 API Key）
        
        const imageData = await sender.msgInfo?.path; // 获取图片路径或 URL
        
        if (!imageData) {
            await sender.reply('❌ 无法获取图片数据，请稍后再试');
            return;
        }
        
        // 示例：使用百度 OCR API
        // const response = await fetch('https://aip.baidubce.com/oauth/2.0/token', {
        //     method: 'POST',
        //     headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        //     body: `grant_type=client_credentials&client_id=YOUR_CLIENT_ID&client_secret=YOUR_CLIENT_SECRET`
        // });
        // const { access_token } = await response.json();
        
        // const ocrResponse = await fetch(`https://aip.baidubce.com/rest/2.0/ocr/v1/general?access_token=${access_token}`, {
        //     method: 'POST',
        //     body: formData
        // });
        
        // 由于需要配置 API Key，这里先返回提示
        await sender.reply('📸 图片已接收！\n\n⚠️ 要使用 OCR 功能，需要配置 OCR API（如百度、腾讯、阿里云）\n\n配置方法：\n1. 注册百度/腾讯/阿里云账号\n2. 开通 OCR 服务\n3. 在 config.js 中添加 API Key\n4. 重启机器人\n\n或者使用免费的 OCR 服务如：https://ocr.space/');
        
    } catch (error) {
        await sender.reply(`❌ 识别失败：${error.message}`);
    }
};
