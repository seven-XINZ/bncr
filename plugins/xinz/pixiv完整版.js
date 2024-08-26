/**
 * @name pixiv完整版
 * @author xinz&啊屁
 * @team xinz
 * @version 1.1.0
 * @description 更具分类搜索随机获取一组涩涩纸片人 也可自定义搜索 并且设置了代理或者直连模式直连速度视你的科学网速而定 图片可以存到本地分类存放
 * @rule ^zpr(18)? (all|illustration|manga|novel|animation|game|original|doujinshi)?$|^pp$|^zpr (.+)$
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
const ppPath = path.join(modPath, 'pp'); // pp 文件夹路径
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
createDirectoryIfNotExists(ppPath); // 确保 pp 文件夹存在

// 发送使用说明
async function sendUsageInstructions(sender) {
    const usageMessage = `
使用方法：
- \`zpr\` - 获取随机普通内容
- \`zpr all\` - 获取所有类型的内容
- \`zpr illustration\` - 获取插图类型的内容
- \`zpr manga\` - 获取漫画类型的内容
- \`zpr novel\` - 获取小说类型的内容
- \`zpr animation\` - 获取动画类型的内容
- \`zpr game\` - 获取游戏类型的内容
- \`zpr original\` - 获取原创内容
- \`zpr doujinshi\` - 获取同人志类型的内容

- \`zpr18 <分类>\` - 获取 R18 内容（同上分类选项）
  - 例如：\`zpr18 manga\` - 获取随机 R18 漫画内容
- \`zpr <自定义内容>\` - 根据自定义内容搜索图片
  - 例如：\`zpr cute cat\` - 搜索与“cute cat”相关的图片
- \`pp\` - 查看此帮助信息
`;
    await sender.reply(usageMessage);
}

// 保存图片到指定文件夹
async function saveImageToFolder(imgURL, r18) {
    const folderPath = path.join(ppPath, r18 === 1 ? 'R18' : 'Normal');
    createDirectoryIfNotExists(folderPath);
    const fileName = path.basename(imgURL);
    const filePath = path.join(folderPath, fileName);

    const writer = fs.createWriteStream(filePath);
    const response = await axios({
        url: imgURL,
        method: 'GET',
        responseType: 'stream',
    });
    response.data.pipe(writer);
    return new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
}

// 获取图片
async function getResult(sender, r18 = 0, category = '', axiosConfig = {}, pageHost = 'i.yuki.sh', customQuery = '') {
    const size = "original"; // 使用原图
    let description = "出错了，没有纸片人看了。";
    let setuList = [];
    try {
        const query = customQuery ? `&keyword=${encodeURIComponent(customQuery)}` : '';
        const { data } = await axios.get(`https://api.lolicon.app/setu/v2?num=1&r18=${r18}&size=${size}&proxy=${pageHost}&excludeAI=true&category=${category}${query}`, { 
            headers, 
            timeout: 10000,
            ...axiosConfig 
        });

        // 检查返回的数据是否有效
        if (data && data.data && data.data.length > 0) {
            for (const result of data.data) {
                const { urls, pid, title, author, tags, r18, category: artCategory } = result;

                // 过滤掉包含 'r18' 或 'r-18' 标签的内容
                if (r18 === 0 && (tags.includes('r18') || tags.includes('R18') || tags.includes('R-18') || tags.includes('r-18'))) {
                    continue; // 如果是普通内容且包含 R18 标签，跳过
                }
                const imgURL = urls.original;

                // 限制标签数量为最多5个
                let tagList = tags.slice(0, 5); // 取前5个标签

                // 将标签列表转换为字符串
                const tagString = tagList.join('，'); // 使用中文逗号分隔

                // 添加图片信息
                setuList.push({
                    title: title,
                    author: author,
                    pid: pid,
                    tags: tagString,
                    category: artCategory || "未分类",
                    imgURL: imgURL,
                    has_spoiler: r18 === 1
                });
            }
        } else {
            description = "没有找到相关内容，请稍后再试。";
        }
    } catch (error) {
        console.error(error);
        description = "连接二次元大门出错。。。";
    }

    return { setuList, description };
}

// 发送图片信息
async function sendImageInfo(sender, item) {
    const message = `
本条数据来源于Lolisuki Api~
标题：${item.title}
画师：${item.author}
画师id：${item.pid}
Level：${item.has_spoiler ? 'R18' : '普通'}
分类：${item.category}
标签：${item.tags}
图片地址：${item.imgURL}
    `;
    await sender.reply(message); // 发送信息
}

// 发送图片并检查是否成功
async function sendImage(sender, imgURL) {
    let success = false;
    let attempts = 0;

    while (!success && attempts < 3) { // 最多尝试 3 次
        try {
            await sender.reply({
                type: 'image',
                path: imgURL, // 使用 imgURL 作为路径
                msg: `查看原图: [点击这里](${imgURL})`
            });
            success = true; // 如果发送成功，设置 success 为 true
        } catch (error) {
            console.error(`发送图片失败，尝试重新获取: ${error}`);
            attempts++;
            // 等待一会儿再重试
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
}

// 发送图片信息并单独发送图片
async function sendImages(sender, setuList) {
    for (const item of setuList) {
        try {
            // 先发送图片信息
            await sendImageInfo(sender, item);
            // 然后发送图片
            await sendImage(sender, item.imgURL);
        } catch (error) {
            console.error(`发送图片或信息失败: ${error}`);
        }
    }
}

// 主处理函数
module.exports = async (sender) => {
    try {
        // 确保必要的包已安装
        await sysMethod.testModule(['axios'], { install: true });
        await ConfigDB.get();
        
        if (!Object.keys(ConfigDB.userConfig).length) {
            const initialMsg = await sender.reply('请先发送"修改zpr配置"，或者前往前端web"插件配置"来完成插件首次配置');
            // 不删除 pp 命令的提示消息
            // 撤回提示消息
            setTimeout(() => {
                sender.delMsg(initialMsg.id);
            }, 30000); // 30秒后撤回
            return;
        }
        
        const config = ConfigDB.userConfig;
        let r18 = config.r18 ? 1 : 0; // 默认 R18 设置
        const msg = sender.getMsg().trim();
        
        // 添加对 pp 命令的处理
        if (msg.toLowerCase() === 'pp') {
            await sendUsageInstructions(sender);
            return; // 不删除 pp 命令的提示消息
        }

        // 解析命令和分类
        const match = msg.match(/^(zpr(18)?)\s*(all|illustration|manga|novel|animation|game|original|doujinshi)?$|^zpr (.+)$/);
        if (!match) {
            const invalidCommandMsg = await sender.reply("命令无效，请使用 'zpr' 或 'zpr18'，后面可以跟上分类（如：all、illustration、manga等）。");
            // 撤回提示消息
            setTimeout(() => {
                sender.delMsg(invalidCommandMsg.id);
            }, 20000); // 20秒后撤回
            return;
        }

        const command = match[1]; // 捕获到的命令
        const category = match[3] ? match[3] : ''; // 捕获到的分类，默认为空
        const customQuery = match[4] ? match[4] : ''; // 捕获到的自定义内容，默认为空

        // 设置 R18
        if (command === "zpr") {
            r18 = 0; // 设置为普通内容
        } else if (command === "zpr18") {
            r18 = 1; // 设置为 R18
        } else if (command === "zpr" && customQuery) {
            r18 = 0; // 确保自定义内容为普通内容
        } else if (command === "zpr18" && customQuery) {
            r18 = 1; // 确保自定义内容为 R18
        }

        // 提示消息
        const loadingMsg = await sender.reply("正在前往二次元，稍等片刻。。。");
        // 撤回提示消息
        setTimeout(() => {
            sender.delMsg(loadingMsg.id);
        }, 20000); // 20秒后撤回
        
        const { setuList, description } = await getResult(sender, r18, category, {}, config.pageHost, customQuery);
        
        if (setuList.length === 0) {
            const errorMsg = await sender.reply(description); // 没有返回内容时发送提示
            // 撤回错误消息
            setTimeout(() => {
                sender.delMsg(errorMsg.id);
            }, 20000); // 20秒后撤回
            return;
        }

        await sender.reply("传送中。。。");
        // 发送图片信息和图片
        await sendImages(sender, setuList); // 传递存储图片的开关

    } catch (error) {
        console.error(error);  // 记录错误日志
        const errorMsg = await sender.reply(`发生错误：\n${error}`);
        // 撤回错误消息
        setTimeout(() => {
            sender.delMsg(errorMsg.id);
        }, 20000); // 20秒后撤回
    }
};
