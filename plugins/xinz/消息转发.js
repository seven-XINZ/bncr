/**
 * @description 监听某个人或群,当触发关键字,转发到指定目的地
 * @team xinz
 * @author seven
 * @platform tgBot qq ssh HumanTG wxQianxun wxXyo wechaty
 * @version v2.0.0
 * @name 消息转发
 * @rule [\s\S]+
 * @priority 100000
 * @admin false
 * @disable false
 * @public true
 * @classification ["功能插件"]  
 */

/* 
这个插件会拦截所有消息进行处理,控制台日志会由此增多
*/

/* 配置 */

const jsonSchema = BncrCreateSchema.object({
	configs: BncrCreateSchema.array(BncrCreateSchema.object({
		enable: BncrCreateSchema.boolean().setTitle('启用').setDescription('是否启用').setDefault(true),
		listen: BncrCreateSchema.object({
			id: BncrCreateSchema.string().setTitle('ID').setDescription(`群号或个人id`).setDefault(""),
			type: BncrCreateSchema.string().setTitle('类型').setDescription('群或个人2选1').setEnum(["userId", "groupId"]).setEnumNames(['个人', '群']).setDefault("groupId"),
			from: BncrCreateSchema.string().setTitle('平台').setDescription(`填写适配器`).setDefault(''),
		}).setTitle('监听来源').setDescription('配置监听来源').setDefault({}),
		rule: BncrCreateSchema.array(BncrCreateSchema.string()).setTitle('触发关键词，填写“任意”则无视关键字').setDefault(['任意']),
		toSender: BncrCreateSchema.array(BncrCreateSchema.object({
			id: BncrCreateSchema.string().setTitle('ID').setDescription(`群号或个人id`).setDefault(""),
			type: BncrCreateSchema.string().setTitle('类型').setDescription('群或个人2选1').setEnum(["userId", "groupId"]).setEnumNames(['个人', '群']).setDefault("groupId"),
			from: BncrCreateSchema.string().setTitle('平台').setDescription(`填写适配器`).setDefault(''),
		})).setTitle('转发目的地').setDescription('转发到哪儿，支持多个').setDefault([]),
		replace: BncrCreateSchema.array(BncrCreateSchema.object({
			old: BncrCreateSchema.string().setTitle('旧消息').setDescription(`需要替换的旧消息`).setDefault(""),
			new: BncrCreateSchema.string().setTitle('新消息').setDescription(`替换后的新消息`).setDefault(""),
		})).setTitle('替换信息').setDescription('需要替换的消息，支持多个').setDefault([]),
		addText: BncrCreateSchema.string().setTitle('自定义尾巴').setDescription(`尾部增加的消息，“\\n”换行`).setDefault("")
	})).setTitle('消息转发').setDescription(`监听某个人或群,当触发关键字,转发到指定目的地`).setDefault([])
});
const ConfigDB = new BncrPluginConfig(jsonSchema);

/* main */
module.exports = async s => {
	try {
		await ConfigDB.get();
		if (!Object.keys(ConfigDB.userConfig).length) {
			console.log('请先发送"修改无界配置",或者前往前端web"插件配置"来完成插件首次配置');
			return 'next';
		}
		const configs = ConfigDB.userConfig.configs.filter(o => o.enable) || [];

		/* 异步处理 */
		await new Promise(resolve => {
			const msgInfo = s.msgInfo;
			for (const config of configs) {
				let msgStr = msgInfo.msg,
					open = false;
				if (msgInfo.from !== config.listen.from || msgInfo[config.listen.type] !== config.listen.id) continue;
				for (const rule of config.rule) {
					if (msgInfo.msg.includes(rule) || rule == "任意") {
						open = true;
						config.replace.forEach(e => (msgStr = msgStr.replace(new RegExp(e.old, 'g'), e.new)));
						break;
					}
				}
				if (!open) break;
				const msgToForward = `${msgStr}${config.addText.replaceAll('\\n', '\n')}`;
				config.toSender.forEach(e => {
					let obj = {
						platform: e.from,
						msg: msgToForward,
					};
					obj[e.type] = e.id;
					sysMethod.push(obj); // 这里需要确保 sysMethod.push 方法存在并按照你的需求进行处理
				});
			}
			resolve();
		});
	}
	catch (e) {
		console.debug(e)
	}
	return 'next';
};
