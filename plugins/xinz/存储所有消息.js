/**
 * @author zhu
 * @name 全体消息
 * @origin zhu
 * @version v1.0.0
 * @description 将无界收到的所有消息存放的本地数据库。
 * @create_at 2023-01-24 21:24:15
 * @rule ^([\s\S]+)$
 * @priority 100000000
 * @admin flase
 * @public false
 * @disable false
 */


module.exports = async s => {
    await sysMethod.testModule(['sqlite3'], {install: true});
    const sqlite3 = require('sqlite3').verbose();
    const fs = require('fs');
    const folderPath = __dirname + '/聊天记录';
    fs.access(folderPath, fs.constants.F_OK, async (err) => {
        if (err) {
            if (err.code === 'ENOENT') {
                // 文件夹不存在，创建它
                fs.mkdir(folderPath, {recursive: true}, (err) => {
                    if (err) {
                        console.error('创建聊天记录文件夹失败', err);
                    } else {
                        console.log('聊天记录文件夹创建成功');
                    }
                });
            } else {
                console.error('创建聊天记录文件夹发生错误', err);
            }
        } else {
            // console.log('文件夹已存在');
            const db = await new sqlite3.Database(__dirname + '/聊天记录/message.db', (err) => {
                if (err) {
                    console.error('Error opening database:', err.message);
                } else {
                    // 检查数据库是否存在
                    db.serialize(() => {
                        db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='msg'", async (err, row) => {
                            if (row === undefined) {
                                db.run(`CREATE TABLE msg
                                        (
                                            id         INTEGER PRIMARY KEY AUTOINCREMENT,
                                            time       TEXT,
                                            "from"     TEXT,
                                            groundName TEXT,
                                            groundId   INTEGER,
                                            userName   TEXT,
                                            userId     INTEGER,
                                            content    TEXT,
                                            msgId      TEXT
                                        )`, (err) => {
                                    if (err) {
                                        console.error('Error creating table:', err.message);
                                    } else {
                                        console.log('Table "msg" created successfully.');
                                    }
                                });
                            } else {
                                // 插入数据
                                const stmt = db.prepare(`INSERT INTO msg (time, "from", groundName, groundId, userName, userId, content, msgId)
                                                         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
                                const time = await sysMethod.getTime('yyyy-MM-dd hh:mm:ss')
                                const data = [time, s.getFrom(), s.getGroupName(), s.getGroupId(), s.getUserName(), s.getUserId(), s.getMsg(), s.getMsgId()];
                                console.log(data)
                                stmt.run(data, function (err) {
                                    if (err) {
                                        console.error('Error inserting data:', err.message);
                                    } else {
                                        console.log('Data inserted successfully. Row ID:', this.lastID);
                                    }
                                });
                                stmt.finalize();
                            }
                        });
                    });

                    // 关闭数据库连接
                    db.close();
                }
            });
        }
    });
    return 'next'
}
