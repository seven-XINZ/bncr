/**
 * @name pixiv
 * @author seven&啊屁
 * @team xinz
 * @version 2.0
 * @description 完善版随机获取一组涩涩纸片人 首次使用请自行到web插件配置配置插件  机器自动科学可使用直连模式 
 需要存储图片则打开存储开关 图片自动存放到mod目录下
 * @rule ^zpr(18)?$
 * @admin false
 * @public false
 * @priority 50
 */

// 常量定义
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// 常量定义
const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/106.0.0.0 Safari/537.36 Edg/106.0.1370.42"
};
const modPath = path.join(__dirname, 'mod'); // mod 文件夹路径
const zprPath = path.join(modPath, 'zpr'); // zpr 文件夹路径
const zpr18Path = path.join(modPath, 'zpr18'); // zpr18 文件夹路径

// 创建文件夹
function createDirectoryIfNotExists(directory) {
    if (!fs.existsSync(directory)) {
        fs.mkdirSync(directory, { recursive: true });
    }
}

// JSON Schema 定义
const jsonSchema = BncrCreateSchema.object({
    r18: BncrCreateSchema.boolean()
        .setTitle('R18内容')
        .setDescription('是否允许获取R18内容')
        .setDefault(false),
    pageHost: BncrCreateSchema.string()
        .setTitle('反代页面')
        .setDescription('配置反代页面地址')
        .setDefault('i.yuki.sh'), // 默认反代页面
    directConnect: BncrCreateSchema.boolean()
        .setTitle('是否直连')
        .setDescription('是否直接连接 API，而不是使用反代')
        .setDefault(false),
    saveImages: BncrCreateSchema.boolean() // 新增的开关
        .setTitle('保存图片')
        .setDescription('是否保存下载的图片')
        .setDefault(false), // 默认不保存
});

const ConfigDB = new BncrPluginConfig(jsonSchema);

// 确保创建分类文件夹
createDirectoryIfNotExists(zprPath);
createDirectoryIfNotExists(zpr18Path);

// 获取图片
async function getResult(sender, r18 = 0, axiosConfig = {}, pageHost = 'i.yuki.sh') {
    const size = "regular";
    let description = "出错了，没有纸片人看了。";
    let setuList = [];
    try {
        const { data } = await axios.get(`https://api.lolicon.app/setu/v2?num=1&r18=${r18}&size=${size}&size=original&proxy=${pageHost}&excludeAI=true`, { 
            headers, 
            timeout: 10000,
            ...axiosConfig 
        });
        const result = data.data;
        for (let i = 0; i < result.length; i++) {
            const { urls, pid, title, width, height } = result[i];
            const imgURL = urls[size];
            const originalURL = urls.original;

            // 添加图片到 setuList
            setuList.push({
                type: 'photo',
                media: imgURL,
                caption: `**${title}**\nPID:[${pid}](https://www.pixiv.net/artworks/${pid})\n查看原图:[点击查看](${originalURL})\n原图尺寸:${width}x${height}`,
                has_spoiler: r18 === 1
            });

            // 保存图片到指定文件夹（根据配置决定是否保存）
            if (ConfigDB.userConfig.saveImages) {
                await saveImageToFolder(imgURL, r18);
            }
        }
    } catch (error) {
        console.error(error);
        description = "连接二次元大门出错。。。";
    }

    return { setuList, description };
}

// 保存图片到文件夹
async function saveImageToFolder(imageUrl, r18) {
    const folderPath = r18 === 1 ? zpr18Path : zprPath; // 根据 r18 选择文件夹
    const fileName = path.basename(imageUrl); // 从 URL 获取文件名
    const filePath = path.join(folderPath, fileName); // 文件完整路径

    // 下载并保存图片
    const writer = fs.createWriteStream(filePath);
    const response = await axios({
        url: imageUrl,
        method: 'GET',
        responseType: 'stream',
        headers
    });

    response.data.pipe(writer);
    return new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
}

// 发送图片并检查是否成功
async function sendImages(sender, setuList) {
    for (const item of setuList) {
        let success = false;
        let attempts = 0;
        
        while (!success && attempts < 3) { // 最多尝试 3 次
            try {
                await sender.reply({
                    type: 'image',
                    path: item.media,
                    msg: item.caption,
                });
                success = true; // 如果发送成功，设置 success 为 true
            } catch (error) {
                console.error(`发送图片失败，尝试重新获取: ${error}`);
                attempts++;
                // 如果发送失败，重新获取图片
                const { setuList: newSetuList, description } = await getResult(sender, item.has_spoiler ? 1 : 0, {}, 'i.yuki.sh');
                if (newSetuList.length > 0) {
                    item.media = newSetuList[0].media; // 更新媒体链接
                    item.caption = newSetuList[0].caption; // 更新标题
                } else {
                    await sender.reply(description); // 如果没有新图片，发送错误描述
                    break; // 跳出重试循环
                }
            }
        }
    }
}

module.exports = async (sender) => {
    try {
        // 确保必要的包已安装
        await sysMethod.testModule(['axios'], { install: true });
        await ConfigDB.get();
        if (!Object.keys(ConfigDB.userConfig).length) {
            return await sender.reply('请先发送"修改zpr配置"，或者前往前端web"插件配置"来完成插件首次配置');
        }
        
        const config = ConfigDB.userConfig;
        let r18 = config.r18 ? 1 : 0; // 默认 R18 设置
        const msg = sender.getMsg();
        
        // 检查命令并设置 R18
        if (msg.trim() === "zpr") {
            r18 = 0; // 设置为普通内容
        } else if (msg.trim() === "zpr18") {
            r18 = 1; // 设置为 R18
        } else {
            return await sender.reply("命令无效，请使用 'zpr' 或 'zpr18'。");
        }

        // 提示消息
        await sender.reply("正在前往二次元，稍等片刻。。。");
        
        const { setuList, description } = await getResult(sender, r18, {}, config.pageHost);
        
        if (setuList.length === 0) {
            await sender.reply(description); // 没有返回内容时发送提示
            return;
        }

        await sender.reply("传送中。。。");
        // 发送图片
        await sendImages(sender, setuList);
    } catch (error) {
        console.error(error);  // 记录错误日志
        await sender.reply(`发生错误：\n${error}`);
    }
};
