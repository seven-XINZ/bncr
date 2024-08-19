/**作者
 * @author xinz&咸鱼
 * @name 容器操作
 * @team xinz&咸鱼
 * @version 1.0
 * @description 容器操作
 * @rule ^(容器操作)$
 * @priority 10000
 * @admin true
 * @disable false
 */

sysMethod.testModule(['ssh2'], { install: true });
const Client = require('ssh2').Client;

module.exports = async s => {
    const host = "0.0.0.0"; // 主机地址
    const port = "000"; // 端口号
    const username = "0000"; // 用户名
    const password = "0000"; // 密码
    
    // 获取容器列表
    const command_names = "docker ps -a --format '{{.Names}}'";
    let projects;

    try {
        projects = (await sshExecCommand(host, port, username, password, command_names)).split('\n').filter(Boolean);
    } catch (error) {
        return s.reply(`获取容器列表失败: ${error.message}`);
    }

    if (projects.length === 0) {
        return s.reply("没有找到任何容器。");
    }

    let isValid = false;
    do {
        const outputWithNumbers = projects.map((item, index) => `${index + 1}. ${item}`).join('\n');
        await s.reply("容器列表:\n" + outputWithNumbers + "\nq.退出");

        let command_id = await s.waitInput(async (s) => { }, 30);
        if (command_id === null) return s.reply('超时退出');
        command_id = command_id.getMsg();
        if (command_id === 'q') return s.reply('已退出');

        const content = await getContentByNumber(command_id);

        if (content !== "序列号超出范围") {
            let userInput;
            do {
                await s.reply("当前容器:" + content +
                    "\n1.启动" +
                    "\n2.停止" +
                    "\n3.重启" +
                    "\n4.升级" +
                    "\n5.设置开机启动" +
                    "\nq.退出" +
                    "\nu.返回");
                let command_eid = await s.waitInput(async (s) => { }, 30);
                if (command_eid === null) return s.reply('超时退出');
                userInput = command_eid.getMsg();
                if (userInput === 'q') return s.reply('已退出');

                let docker_command;
                switch (userInput) {
                    case "1":
                        docker_command = `docker start ${content}`;
                        break;
                    case "2":
                        docker_command = `docker stop ${content}`;
                        break;
                    case "3":
                        docker_command = `docker restart ${content}`;
                        break;
                    case "4":
                        docker_command = `docker run --rm -v /var/run/docker.sock:/var/run/docker.sock containrrr/watchtower -cR ${content}`;
                        break;
                    case "5":
                        docker_command = `docker update --restart=always ${content}`;
                        break;
                    case "u":
                        isValid = false;
                        break;
                    default:
                        await s.reply("错误：序列号超出范围，请重新输入。");
                        continue;
                }

                if (userInput === 'u') {
                    break;
                }

                // 执行 Docker 命令并捕获输出
                try {
                    const output = await sshExecCommand(host, port, username, password, docker_command);
                    const formattedOutput = output.trim(); // 去掉首尾空格和换行
                    if (formattedOutput.includes("Error")) {
                        // 如果输出中包含错误信息，返回错误
                        await s.reply(`操作失败:\n${formattedOutput}`);
                    } else {
                        // 正常操作成功，返回结果
                        await s.reply(`操作成功:\n${formattedOutput}`);
                    }
                } catch (error) {
                    await s.reply(`执行命令失败: ${error.message}`);
                }

            } while (userInput !== 'q');

        } else {
            await s.reply("错误：序列号超出范围，请重新输入。");
        }
    } while (!isValid);

    async function getContentByNumber(number) {
        if (number >= 1 && number <= projects.length) {
            return projects[number - 1];
        } else {
            return "序列号超出范围";
        }
    }

    async function sshExecCommand(host, port, username, password, command) {
        return new Promise((resolve, reject) => {
            const conn = new Client();
            conn.on('ready', () => {
                conn.exec(command, (err, stream) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    let output = '';
                    stream.on('close', (code, signal) => {
                        conn.end();
                        resolve(output);
                    }).on('data', (data) => {
                        output += data.toString().trim();
                    }).stderr.on('data', (data) => {
                        console.error('STDERR: ' + data);
                        // 直接将标准错误输出发送给用户
                        s.reply(`操作错误:\n${data}`);
                    });
                });
            }).connect({ host, port, username, password });
        });
    }
}
