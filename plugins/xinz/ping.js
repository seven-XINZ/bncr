/**
 * @author seven
 * @name ping
 * @team xinz
 * @version 1.17.0
 * @description ping/web测速插件
 * @rule ^ping (.+)$
 * @admin false
 * @public true
 * @priority 9999
 * @disable false
 * @classification ["功能插件"]
 */

const { exec } = require('child_process');
const got = require('got');
const dns = require('dns');

/**
 * 插件入口，插件被触发时将运行该function
 * @param {Sender} sender
 */
module.exports = async sender => {
    // 处理 ping 指令
    const pingMatch = sender.getMsg().match(/^ping (.+)$/);
    if (pingMatch) {
        const address = pingMatch[1];
        await pingAndWebTest(address, sender);
    }
};

/**
 * ping 和 web 测试
 * @param {string} address - 要测试的地址
 * @param {Sender} sender - Sender对象
 */
async function pingAndWebTest(address, sender) {
    // 先进行 DNS 解析
    dns.lookup(address, async (err, ipAddress) => {
        if (err) {
            sender.reply(`无法解析 DNS: ${err.message}`);
            return;
        }

        // 输出 DNS 解析结果
        const dnsOutput = `dns: ${ipAddress}`;

        // 查询 IP 地址的地理位置
        let regionOutput = '';
        try {
            const locationResponse = await got(`https://ipinfo.io/${ipAddress}/json`);
            const locationData = JSON.parse(locationResponse.body);
            const city = locationData.city || '';
            const region = locationData.region || '';
            const country = locationData.country || '';

            // 生成地区字符串
            regionOutput = `地区: ${city ? city + ', ' : ''}${region ? region + ', ' : ''}${country}`;
        } catch (error) {
            regionOutput = `地区信息获取失败: ${error.message}`;
        }

        // 执行 ping 测试
        exec(`ping -c 4 ${ipAddress}`, async (error, stdout, stderr) => {
            if (error) {
                sender.reply(`ping ${address} 出现错误: ${stderr}`);
                return;
            }

            // 解析 ping 结果
            const lines = stdout.split('\n');
            let packetsSent = 0;
            let packetsReceived = 0;
            let minDelay = Infinity; // 初始化最小延迟
            let pingOutput = '';

            lines.forEach(line => {
                if (line.includes('bytes from')) {
                    packetsSent++;
                    const timeMatch = line.match(/time=(\d+\.?\d*) ms/);
                    if (timeMatch) {
                        const delay = parseFloat(timeMatch[1]);
                        packetsReceived++;
                        // 更新最小延迟
                        if (delay < minDelay) {
                            minDelay = delay;
                        }
                    }
                } else if (line.includes('packet loss')) {
                    const lossMatch = line.match(/([\d.]+)% packet loss/);
                    if (lossMatch) {
                        const lossRate = lossMatch[1];
                        const successRate = (1 - (packetsReceived / packetsSent)) * 100;
                        pingOutput += `丢包率: ${lossRate}%\n成功率: ${successRate.toFixed(2)}%`;
                    }
                }
            });

            // 如果没有成功的 ping 结果
            if (pingOutput === '') {
                sender.reply(`无法提取 IP 地址，请检查地址 ${address}`);
                return;
            }

            // 格式化输出
            const finalPingOutput = `ip: ${ipAddress}\n延迟: ${minDelay === Infinity ? '无' : minDelay + ' ms'}`;

            // 进行 web 测试
            const startTime = Date.now(); // 记录开始时间
            try {
                // 自动补全 https/http，优先使用 https
                const url = /^https?:\/\//i.test(address) ? address : `https://${address}`;
                const response = await got(url, { timeout: 5000, https: { rejectUnauthorized: false } }); // 设置超时时间
                const duration = Date.now() - startTime; // 计算耗时
                
                // 发送格式化的结果
                const replyMessage = `ping ${address}\n${dnsOutput}\n${regionOutput}\n${finalPingOutput}\n访问 ${url} 成功，用时: ${duration} ms\n发包: ${packetsSent}\n接收: ${packetsReceived}\n${pingOutput}`;
                sender.reply(replyMessage);
            } catch (error) {
                const errorMessage = `ping ${address}\n${dnsOutput}\n${regionOutput}\n${finalPingOutput}\n访问 ${url} 失败: ${error.message}\n发包: ${packetsSent}\n接收: ${packetsReceived}\n${pingOutput}`;
                sender.reply(errorMessage);
            }
        });
    });
}
