/**
 * @author seven
 * @name tgstickstoqq
 * @description docker exec bncr -it /bin/sh apk add ffmpeg
 * @rule ^sticks$
 * @rule ^(sticks) ([\s\S]+)$
 * @version 1.0.00
 * @priority 100001
 * @admin false
 * @team xinz
 * @platform wx pgm tg web qq ntqq
 * @disable false
 * @systemVersion >=:2.0.5
 * @classification ["表情“]
 * @public true
*/
const got = require('got');
const path = require('path');
const fs = require('fs').promises;
const ffmpeg = require('fluent-ffmpeg');
const { spawn, exec } = require('child_process');
const usrDb = new BncrDB("tg2qq");
const { randomUUID } = require('crypto');
const { log } = require('console');
let sticker_set_name
let saveFolder
module.exports = async (s) => {
    const param2 = s.param(2)
    const platform = s.getFrom();
    const userId = s.getUserId();
    console.log(platform);
    const Token = await usrDb.get("token");
    const baseURL = `https://api.telegram.org/bot${Token}/`;
    async function downloadSticker(file_id, saveFolder) {
        console.log(baseURL);

        const fileResponse = await got.get(`${baseURL}getFile`, {
            searchParams: {
                file_id: file_id
            },
            responseType: 'json'
        });
        console.log(fileResponse.body);
        const file_path = fileResponse.body.result.file_path;
        console.log(`Downloading ${file_id}...${file_path}`);
        const fileURL = `https://api.telegram.org/file/bot${Token}/${file_path}`;
        const savePath = path.join(saveFolder, file_path.split('/').pop());
        const fileData = await got.get(fileURL, { responseType: 'buffer' });
        await fs.writeFile(savePath, fileData.body);

        console.log(`Downloaded to ${savePath}`);
    }
    async function downloadStickers() {
        try {
            const response = await got.get(`${baseURL}getStickerSet`, {
                searchParams: { name: sticker_set_name },
                responseType: 'json'
            });
            console.log(baseURL);
            console.log(response.body);
            const stickers = response.body.result.stickers;
            const downloadPromises = stickers.map(sticker => downloadSticker(sticker.file_id, saveFolder));
            await Promise.all(downloadPromises);
            console.log('All stickers downloaded');
        } catch (error) {
            console.error(`Error downloading stickers: ${error.message}`);
            throw error;
        }
    }
    async function convertStickers(folder, resolution = 320, fps = 16) {
        try {
            const files = await fs.readdir(folder);
            if (files.length === 0) {
                throw new Error("No files in the save folder");
            }

            if (files[0].endsWith('.tgs')) {
                await convertTgsFiles(folder, resolution, fps);
            } else if (files[0].endsWith('.webm')) {
                await convertFolderToGifs(folder);
            }     // 检查文件是否以 '.webp' 结尾 或者 没有后缀
            else if (files[0].endsWith('.webp') || !files[0].includes('.')) {
                await renameWebpToGif(folder);
            }
        } catch (error) {
            console.error(`Error converting stickers: ${error.message}`);
            throw error;
        }
    }
    async function renameWebpToGif(folder) {
        try {
            const files = await fs.readdir(folder);
            const webpFiles = files.filter(file => file.endsWith('.webp') || !file.includes('.'));
            for (let file of webpFiles) {
                const oldPath = path.join(folder, file);
                const newPath = file.endsWith('.webp')
                    ? path.join(folder, file.replace('.webp', '.gif'))
                    : path.join(folder, file + '.gif');
                await fs.rename(oldPath, newPath);
            }

            console.log(`All .webp files in ${folder} have been renamed to .gif`);
        } catch (error) {
            console.error(`Error renaming .webp to .gif in ${folder}: ${error.message}`);
        }
    }

    async function sendStickersToUser(folder, sticker_set_name) {
        try {
            const userId = await usrDb.get(s.getUserId());
            let sendName = (sticker_set_name === "tmpSticker") ? "" : sticker_set_name;
            s.reply(`${sendName}开始发送给${userId}`);
            await sendStickers(userId, folder, sticker_set_name);
        } catch (error) {
            console.error(`Error sending stickers: ${error.message}`);
            throw error;
        }
    }
    async function handleStickerDownloadAndSend() {
        const saveFolder = path.join("/bncr/BncrData/public/", sticker_set_name);
        try {
            await fs.mkdir(saveFolder);
            await downloadStickers(saveFolder);
            await convertStickers(saveFolder);
        } catch (error) {
            if (error.code !== 'EEXIST') {
                console.error(`Error in handling stickers: ${error.message}`);
                return;
            }
        }
        await sendStickersToUser(saveFolder, sticker_set_name);
    }
    async function handleSignleStickerDownloadAndSend(file_id) {
        const folder = path.join("/bncr/BncrData/public/", "tmpSticker");
        try {
            await fs.mkdir(folder, { recursive: true });
            await downloadSticker(file_id, folder);
            await convertStickers(folder, 512, 24);
            await sendStickersToUser(folder, "tmpSticker");
            await sleep(1000)
            await fs.rm(folder, { recursive: true });
        } catch (error) {
            console.error(`Error in handling stickers: ${error.message}`);
        }
    }
    async function convertFolderToGifs(folderPath) {
        const files = await fs.readdir(folderPath);

        for (const file of files) {
            if (file.endsWith('.webm')) {
                const inputPath = path.join(folderPath, file);
                const outputPath = path.join(folderPath, file.replace('.webm', '.gif'));

                try {
                    await convertWebMToGif(inputPath, outputPath);
                    // Delete the original WebM file after successful conversion
                    await fs.unlink(inputPath);
                    console.log(`Deleted original file ${inputPath}`);
                } catch (error) {
                    console.error(`Error processing file ${inputPath}: ${error}`);
                }
            }
        }
    }

    async function convertWebMToGif(inputPath, outputPath) {
        return new Promise((resolve, reject) => {
            ffmpeg(inputPath)
                .toFormat('gif')
                .on('error', (err) => {
                    console.error(`An error occurred for file ${inputPath}: ` + err.message);
                    reject(err);
                })
                .on('end', () => {
                    console.log(`Conversion finished for file ${inputPath}`);
                    resolve();
                })
                .save(outputPath);
        });
    }
    async function convertTgsFiles(folder, resolution, fps) {
        if (folder === '/bncr/BncrData/public/tmpSticker') sticker_set_name = 'tmpSticker';
        const dockerCommand = 'docker';
        const dockerArgs = [
            'run', '--rm',
            '-e', `HEIGHT=${resolution}`, // 传递环境变量给容器
            '-e', `WIDTH=${resolution}`,
            '-e', `FPS=${fps}`,
            '-v', `/data/bncr/public/${sticker_set_name}:/source`,
            'edasriyan/lottie-to-gif'
        ];
        return new Promise((resolve, reject) => {
            const dockerProcess = spawn(dockerCommand, dockerArgs);

            dockerProcess.stdout.on('data', (data) => {
                console.log(`stdout: ${data}`);
                // 根据输出处理文件并发送
            });

            dockerProcess.stderr.on('data', (data) => {
                console.error(`stderr: ${data}`);
            });

            dockerProcess.on('close', (code) => {
                console.log(`child process exited with code ${code}`);
                if (code === 0) {
                    resolve();  // 如果进程成功完成，解析 promise
                } else {
                    reject(new Error(`Docker process exited with code ${code}`));  // 如果进程以非零代码退出，拒绝 promise
                }
            });
        });
    }
    async function sendStickers(userId, folder, sticker_set_name) {
        try {
            // 异步读取文件夹中的所有文件
            const files = await fs.readdir(folder);

            // 过滤出 .gif 文件
            const gifFiles = files.filter(file => file.endsWith('.gif'));
            //如果没有。gif文件，抛出错误并删除文件夹
            if (gifFiles.length === 0) {
                console.log(`Attempting to delete folder: ${folder}`);
                await fs.rm(folder, { recursive: true });
                console.log(`Folder deleted successfully: ${folder}`);
                //删除错误文件夹并重新下载发送
                await handleStickerDownloadAndSend();
                throw new Error(`No .gif files found in ${folder}`);
            }

            // 创建一个senders数组，你可以根据需要添加更多的发送者
            const senders = [{
                id: userId,
                type: 'userId',
            }];

            // 创建一个 promises 数组来存储所有的发送操作
            const sendPromises = [];
            // 循环遍历所有的发送者和文件，创建发送对象，并将发送 promise 添加到 promises 数组中
            for (const sender of senders) {
                for (const filename of gifFiles) {
                    const obj = {
                        platform: "qq",
                        path: `http://192.168.3.6:9090/public/${sticker_set_name}/${filename}`,
                        type: 'image',
                        msg: '',
                    };
                    obj[sender.type] = sender.id;

                    // 假设 sysMethod.push 返回一个 promise
                    const sendPromise = sysMethod.push(obj);
                    sendPromises.push(sendPromise);
                    // 获取一个介于1000到5000之间的随机数
                    const randomDelay = getRandomDelay(300, 5000);
                    await sleep(randomDelay);

                }
            }

            // 等待所有的发送操作完成
            await Promise.all(sendPromises);
            console.log('All stickers sent');

        } catch (error) {
            s.reply(`Error sending stickers: ${error.message}`);
            console.error(`Error: ${error.message}`);
        }
    }
    function getRandomDelay(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    async function handlePlatform(pgmbot) {
        if (pgmbot && !param2) {
            await handlePgmbot();
        } else {
            await handleOthers();
        }
    }
    async function handlePgmbot() {
        let ifExist = await usrDb.get(userId);
        console.log(ifExist);
        if (!ifExist) {
            let random = randomUUID();
            console.log(random);
            usrDb.set(userId, random);
            s.reply(`请使用qq对机器人发送\nsticks ${random}\n进行验证`);
        } else {
            await handleExistingUser();
        }
    }
    async function handleExistingUser() {
        s.reply('请发送贴纸');
        await s.waitInput(async (s) => {
            let msg = s.getMsg();
            if (msg === 'q') {
                s.reply('已取消');
            } else {
                let part = msg.split('&');
                if (part[0] !== '[sticker]') {
                    s.reply('请发送贴纸,你他妈发的什么东西');
                    return;
                }
                sticker_set_name = part[1];
                saveFolder = path.join("/bncr/BncrData/public/", sticker_set_name);
                await handleSignleStickerDownloadAndSend(part[2]);
                s.reply('1:进入连续发送模式\n2:发送贴纸包全部贴纸\nq:退出')
                msg = await s.waitInput(() => { }, 30);
                msg = msg.getMsg()
                if (msg === '1') {
                    s.reply('进入连续发送模式,q退出');
                    let a = true;
                    while (a) {
                        await s.waitInput(async (s) => {
                            let msg = s.getMsg();
                            if (msg === 'q') {
                                s.reply('已取消');
                                a = false;
                                return;
                            } else {
                                let part = msg.split('&');
                                if (part[0] !== '[sticker]') {
                                    s.reply('请发送贴纸,你他妈发的什么东西');
                                    return;
                                }
                                await handleSignleStickerDownloadAndSend(part[2]);
                            }
                        }, 30);

                    }
                } else if (msg === '2') {
                    await handleStickerDownloadAndSend();
                } else {
                    s.reply('已取消');
                    return;
                }

            }
        }, 30);
    }
    async function handleOthers() {
        if (!param2) {
            s.reply('请使用tg对机器人发送\nsticks\n获取绑定码');
            return;
        }
        if (param2.length > 15) {
            await bindUser();
        }
    }
    async function bindUser() {
        const keys = await usrDb.keys();
        for (const key of keys) {
            const storedRandom = await usrDb.get(key);
            if (storedRandom === param2) {
                await usrDb.set(key, userId);
                s.reply(`tg:${key}qq:${userId}已经成功绑定`);
                break;
            }
        }
    }
    let platformIsTg = platform === 'pgm' || platform === 'tgBot';
    await handlePlatform(platformIsTg);
}
