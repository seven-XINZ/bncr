/** 
 * @author seven
 * @name 天气
 * @team xinz
 * @version 1.0.22
 * @description 中文城市自动转英文查询天气
 * @rule ^天气([\s\S]+)$
 * @rule ^([\s\S]+)(天气)$
 * @admin false
 * @public false
 * @priority 9999
 * @disable false
 * @service false
 */

const https = require('https'); // 使用 Node.js 内置的 https 模块

// 中文城市名称与英文名称的映射表  //使用英文可查全球
const cityMapping = {
    // 中国
    "北京市": {
        "Beijing": {
            "东城区": "Dongcheng District",
            "西城区": "Xicheng District",
            "朝阳区": "Chaoyang District",
            "丰台区": "Fengtai District",
            "石景山区": "Shijingshan District",
            "海淀区": "Haidian District",
            "门头沟区": "Mentougou District",
            "房山区": "Fangshan District",
            "通州区": "Tongzhou District",
            "顺义区": "Shunyi District",
            "昌平区": "Changping District",
            "大兴区": "Daxing District",
            "怀柔区": "Huairou District",
            "平谷区": "Pinggu District",
            "密云区": "Miyun District",
            "延庆区": "Yanqing District"
        }
    },
    "上海市": {
        "Shanghai": {
            "黄浦区": "Huangpu District",
            "徐汇区": "Xuhui District",
            "长宁区": "Changning District",
            "静安区": "Jing'an District",
            "普陀区": "Putuo District",
            "虹口区": "Hongkou District",
            "杨浦区": "Yangpu District",
            "闵行区": "Minhang District",
            "宝山区": "Baoshan District",
            "嘉定区": "Jiading District",
            "浦东新区": "Pudong New Area",
            "金山区": "Jinshan District",
            "松江区": "Songjiang District",
            "青浦区": "Qingpu District",
            "奉贤区": "Fengxian District",
            "崇明区": "Chongming District"
        }
    },
    "广州市": {
        "Guangzhou": {
            "荔湾区": "Liwan District",
            "越秀区": "Yuexiu District",
            "海珠区": "Haizhu District",
            "天河区": "Tianhe District",
            "白云区": "Baiyun District",
            "黄埔区": "Huangpu District",
            "番禺区": "Panyu District",
            "花都区": "Huadu District",
            "南沙区": "Nansha District",
            "从化区": "Conghua District",
            "增城区": "Zengcheng District"
        }
    },
    "深圳市": {
        "Shenzhen": {
            "罗湖区": "Luohu District",
            "福田区": "Futian District",
            "南山区": "Nanshan District",
            "盐田区": "Yantian District",
            "宝安区": "Bao'an District",
            "龙岗区": "Longgang District",
            "坪山区": "Pingshan District",
            "光明区": "Guangming District",
            "大鹏新区": "Dapeng New District"
        }
    },
    "天津市": {
        "Tianjin": {
            "和平区": "Heping District",
            "河东区": "Hedong District",
            "河西区": "Hexi District",
            "南开区": "Nankai District",
            "河北区": "Hebei District",
            "红桥区": "Hongqiao District",
            "东丽区": "Dongli District",
            "西青区": "Xiqing District",
            "津南区": "Jinnan District",
            "北辰区": "Beichen District",
            "武清区": "Wuqing District",
            "宝坻区": "Baodi District",
            "滨海新区": "Binhai New Area",
            "宁河区": "Ninghe District",
            "静海区": "Jinghai District",
            "蓟州区": "Jizhou District"
        }
    },
    "重庆市": {
        "Chongqing": {
            "渝中区": "Yuzhong District",
            "大渡口区": "Dadukou District",
            "江北区": "Jiangbei District",
            "南岸区": "Nanan District",
            "北碚区": "Beibei District",
            "渝北区": "Yubei District",
            "巴南区": "Banan District",
            "黔江区": "Qianjiang District",
            "长寿区": "Changshou District",
            "江津区": "Jiangjin District",
            "合川区": "Hechuan District",
            "永川区": "Yongchuan District",
            "南川区": "Nanchuan District",
            "璧山区": "Bishan District",
            "铜梁区": "Tongliang District",
            "大足区": "Dazu District",
            "荣昌区": "Rongchang District",
            "万州区": "Wanzhou District",
            "涪陵区": "Fuling District",
            "垫江县": "Dianjiang County",
            "丰都县": "Fengdu County",
            "云阳县": "Yunyang County",
            "忠县": "Zhongxian County",
            "石柱土家族自治县": "Shizhu Tujia Autonomous County",
            "酉阳土家族自治县": "Youyang Tujia Autonomous County",
            "彭水苗族土家族自治县": "Pengshui Miao and Tujia Autonomous County"
        }
    },

    // 其他省份（部分省份示例）
    "广东省": {
        "Guangdong": {
            "广州市": {
                "Guangzhou": {
                    "荔湾区": "Liwan District",
                    "越秀区": "Yuexiu District",
                    "海珠区": "Haizhu District",
                    "天河区": "Tianhe District",
                    "白云区": "Baiyun District",
                    "黄埔区": "Huangpu District",
                    "番禺区": "Panyu District",
                    "花都区": "Huadu District",
                    "南沙区": "Nansha District",
                    "从化区": "Conghua District",
                    "增城区": "Zengcheng District"
                }
            },
            "深圳市": {
                "Shenzhen": {
                    "罗湖区": "Luohu District",
                    "福田区": "Futian District",
                    "南山区": "Nanshan District",
                    "盐田区": "Yantian District",
                    "宝安区": "Bao'an District",
                    "龙岗区": "Longgang District",
                    "坪山区": "Pingshan District",
                    "光明区": "Guangming District",
                    "大鹏新区": "Dapeng New District"
                }
            },
            // 其他城市...
        }
    },
    "江苏省": {
        "Jiangsu": {
            "南京市": {
                "Nanjing": {
                    "玄武区": "Xuanwu District",
                    "秦淮区": "Qinhuai District",
                    "建邺区": "Jianye District",
                    "鼓楼区": "Gulou District",
                    "浦口区": "Pukou District",
                    "栖霞区": "Qixia District",
                    "雨花台区": "Yuhuatai District",
                    "江宁区": "Jiangning District",
                    "六合区": "Liuhe District",
                    "溧水区": "Lishui District",
                    "高淳区": "Gaochun District"
                }
            },
            // 其他城市...
        }
    },
    "浙江省": {
        "Zhejiang": {
            "杭州市": {
                "Hangzhou": {
                    "上城区": "Shangcheng District",
                    "下城区": "Xiacheng District",
                    "江干区": "Jianggan District",
                    "拱墅区": "Gongshu District",
                    "西湖区": "Xihu District",
                    "滨江区": "Binjiang District",
                    "萧山区": "Xiaoshan District",
                    "余杭区": "Yuhang District",
                    "建德市": "Jiande City",
                    "富阳区": "Fuyang District",
                    "临安区": "Lin'an District"
                }
            },
            // 其他城市...
        }
    },
    "四川省": {
        "Sichuan": {
            "成都市": {
                "Chengdu": {
                    "锦江区": "Jinjiang District",
                    "青羊区": "Qingyang District",
                    "金牛区": "Jinniu District",
                    "武侯区": "Wuhou District",
                    "成华区": "Chenghua District",
                    "龙泉驿区": "Longquanyi District",
                    "青白江区": "Qingbaijiang District",
                    "新都区": "Xindu District",
                    "温江区": "Wenjiang District",
                    "金堂县": "Jintang County",
                    "双流区": "Shuangliu District",
                    "郫都区": "Pidu District",
                    "大邑县": "Dayi County",
                    "蒲江县": "Pujiang County",
                    "新津县": "Xinjin County",
                    "邛崃市": "Qionglai City",
                    "崇州市": "Chongzhou City"
                }
            },
            // 其他城市...
        }
    },

    // 其他国家（示例）
    "美国": {
        "United States": {
            "纽约市": {
                "New York City": {
                    "曼哈顿": "Manhattan",
                    "布朗克斯": "Bronx",
                    "布鲁克林": "Brooklyn",
                    "皇后区": "Queens",
                    "斯塔滕岛": "Staten Island"
                }
            },
            "洛杉矶": {
                "Los Angeles": {
                    "好莱坞": "Hollywood",
                    "洛杉矶市中心": "Downtown Los Angeles",
                    "西洛杉矶": "West Los Angeles",
                    "南洛杉矶": "South Los Angeles",
                    "圣费尔南多谷": "San Fernando Valley"
                }
            },
            // 其他城市...
        }
    },
    "英国": {
        "United Kingdom": {
            "伦敦": {
                "London": {
                    "市中心": "Central London",
                    "威斯敏斯特": "Westminster",
                    "南华克": "Southwark",
                    "哈克尼": "Hackney",
                    "布伦特": "Brent"
                }
            },
            // 其他城市...
        }
    },
    "加拿大": {
        "Canada": {
            "多伦多": {
                "Toronto": {
                    "市中心": "Downtown",
                    "北约克": "North York",
                    "士嘉堡": "Scarborough",
                    "密西沙加": "Mississauga",
                    "旺市": "Vaughan"
                }
            },
            // 其他城市...
        }
    },
    // 继续添加更多国家和城市...
};

// 风向转换映射
const windDirectionMapping = {
    "N": "北风",          // 0°
    "NNE": "东北偏北",    // 22.5°
    "NE": "东北风",       // 45°
    "ENE": "东南偏东",    // 67.5°
    "E": "东风",          // 90°
    "ESE": "东南偏东",    // 112.5°
    "SE": "东南风",       // 135°
    "SSE": "南偏东",      // 157.5°
    "S": "南风",          // 180°
    "SSW": "南偏西",      // 202.5°
    "SW": "西南风",       // 225°
    "WSW": "西偏南",      // 247.5°
    "W": "西风",          // 270°
    "WNW": "西北偏西",    // 292.5°
    "NW": "西北风",       // 315°
    "NNW": "北偏西",      // 337.5°
    "C": "静风",          // 无风
    "N-NNE": "北至东北偏北", // 0° - 22.5°
    "NNE-NE": "东北偏北至东北", // 22.5° - 45°
    "NE-ENE": "东北至东南偏东", // 45° - 67.5°
    "ENE-E": "东南偏东至东", // 67.5° - 90°
    "E-ESE": "东至东南偏东", // 90° - 112.5°
    "ESE-SE": "东南偏东至东南", // 112.5° - 135°
    "SE-SSE": "东南至南偏东", // 135° - 157.5°
    "SSE-S": "南偏东至南", // 157.5° - 180°
    "S-SW": "南至西南", // 180° - 225°
    "SW-WSW": "西南至西偏南", // 225° - 247.5°
    "WSW-W": "西偏南至西", // 247.5° - 270°
    "W-WNW": "西至西北偏西", // 270° - 292.5°
    "WNW-NW": "西北偏西至西北", // 292.5° - 315°
    "NW-NNW": "西北至北偏西", // 315° - 337.5°
    "NNW-N": "北偏西至北", // 337.5° - 360°
};
// 示例使用
const windDirection = "NW";
const translatedWindDirection = windDirectionMapping[windDirection] || "未知风向";
console.log(`风向: ${translatedWindDirection}`); // 输出: 风向: 西北风


// 天气状况翻译映射
const weatherConditionMapping = {
    "Sunny": "晴",
    "Partly cloudy": "局部多云",
    "Cloudy": "多云",
    "Overcast": "阴天",
    "Rain": "雨",
    "Drizzle": "毛毛雨",
    "Thunderstorm": "雷暴",
    "Snow": "雪",
    "Fog": "雾",
    "Patchy rain nearby": "局部降雨",
    "Light rain": "小雨",
    "Moderate rain": "中雨",
    "Heavy rain": "大雨",
    "Showers": "阵雨",
    "Isolated thunderstorms": "局部雷暴",
    "Sleet": "雨夹雪",
    "Hail": "冰雹",
    "Windy": "有风",
    "Blizzard": "暴风雪",
    "Tornado": "龙卷风",
    "Dust storm": "沙尘暴",
    "Heat wave": "热浪",
    "Cold wave": "寒潮",
    "Tropical storm": "热带风暴",
    "Hurricane": "飓风",
    "Freezing rain": "冻雨",
    "Mist": "薄雾",
    "Smoke": "烟雾",
    "Squall": "阵风",
    "Frost": "霜",
    "Ice": "冰",
    "Clear": "晴朗",
    "Partly sunny": "局部晴朗",
    "Light snow": "小雪",
    "Moderate snow": "中雪",
    "Heavy snow": "大雪",
    "Freezing fog": "冰雾",
    "Thundersnow": "雷雪",
    "Sandstorm": "沙暴",
    "Tropical depression": "热带低气压",
    "Severe thunderstorm": "强雷暴",
    "Rain shower": "降雨",
    "Heavy showers": "大阵雨",
    "Intermittent rain": "间歇性降雨",
    "Overcast with rain": "阴天伴随降雨",
    "Overcast with snow": "阴天伴随降雪",
    "Overcast with thunderstorms": "阴天伴随雷暴",
    "Flurries": "小雪花",
    "Light rain shower": "小阵雨",
    "Heavy rain shower": "大阵雨",
    "Rain and snow mix": "雨雪混合",
    "Thundery outbreaks in nearby": "附近有雷暴活动", // 新增翻译
    "Heavy thundershowers": "强雷阵雨", // 强雷阵雨
    "Light thundershowers": "小雷阵雨", // 小雷阵雨
    "Overcast with light rain": "阴天伴随小雨", // 阴天伴随小雨
    "Overcast with heavy rain": "阴天伴随大雨", // 阴天伴随大雨
    "Overcast with light snow": "阴天伴随小雪", // 阴天伴随小雪
    "Overcast with heavy snow": "阴天伴随大雪", // 阴天伴随大雪
    "Torrential rain": "倾盆大雨", // 倾盆大雨
    "Patchy fog": "局部雾", // 局部雾
    "Freezing drizzle": "冻毛毛雨", // 冻毛毛雨
    "Ice pellets": "冰粒", // 冰粒
    "Smoke haze": "烟雾弥漫", // 烟雾弥漫
    "Heavy freezing rain": "大冻雨", // 大冻雨
    "Severe blizzard": "严重暴风雪", // 严重暴风雪
    "Severe cold wave": "严重寒潮", // 严重寒潮
    "Heavy dust storm": "大沙尘暴", // 大沙尘暴
    "Light dust storm": "小沙尘暴", // 小沙尘暴
    "Tropical cyclone": "热带气旋", // 热带气旋
    "Severe tropical storm": "强热带风暴", // 强热带风暴
    "Light frost": "小霜", // 小霜
    "Heavy frost": "大霜", // 大霜
};

// 示例使用
const weatherDescription = "Torrential rain";
const translatedWeather = weatherConditionMapping[weatherDescription] || "未知天气状况";
console.log(`天气状况: ${translatedWeather}`); // 输出: 天气状况: 倾盆大雨


// 示例使用
const weatherDescription = "Light rain";
const translatedWeather = weatherConditionMapping[weatherDescription] || "未知天气状况";
console.log(`天气状况: ${translatedWeather}`); // 输出: 天气状况: 小雨



// 导出模块
module.exports = async s => {
    // 获取用户输入的城市名
    const cityInput = s.param(1).trim();  // 获取输入并去除多余空格

    // 检查是否为中文城市名称并转换为英文
    const city = cityMapping[cityInput] || cityInput; // 如果映射表中存在则转换，否则使用原输入

    // 构造请求 URL
    const apiKey = '1d644fbd70be4c06a4c74543241905'; // 使用您提供的 WeatherAPI API 密钥
    const url = `https://api.weatherapi.com/v1/current.json?key=${apiKey}&q=${encodeURIComponent(city)}&aqi=no`;
    console.log("请求的 URL:", url); // 打印请求的 URL
    console.log("查询的城市名称:", city); // 打印查询的城市名称

    // 发送 HTTPS 请求
    https.get(url, async (response) => {
        let data = '';
        
        // 监听数据接收
        response.on('data', chunk => {
            data += chunk;
        });

        // 监听请求结束
        response.on('end', async () => {
            console.log("接收到的原始数据:", data); // 打印接收到的原始数据
            
            // 尝试解析 JSON 格式
            try {
                const result = JSON.parse(data);
                console.log("解析后的结果:", result); // 打印解析后的结果
                
                // 检查返回的结果
                if (result.error) {
                    // 如果返回的状态码不是 200，说明请求失败
                    await s.reply(`查询失败：${result.error.message}。请检查城市名称是否正确。`);
                    return;
                }

                // 提取天气数据
                const location = result.location.name; // 城市名称
                const temperature = result.current.temp_c; // 温度
                const weather = weatherConditionMapping[result.current.condition.text] || result.current.condition.text; // 天气状况翻译
                const windDirection = windDirectionMapping[result.current.wind_dir] || result.current.wind_dir; // 风向翻译
                const windPower = result.current.wind_kph; // 风速
                const humidity = result.current.humidity; // 湿度
                const reportTime = result.current.last_updated; // 发布时间

                // 格式化返回信息为中文标准
                const weatherReport = `地区：${location}（${cityInput}）\n` + // 显示原输入城市名称
                                      `温度：${temperature}°C\n` +
                                      `天气状况：${weather}\n` +
                                      `风向：${windDirection}\n` +  // 这里使用了中文风向
                                      `风速：${windPower}公里/小时\n` +
                                      `湿度：${humidity}%\n` +
                                      `发布时间：${reportTime}`;

                // 发送天气信息
                await s.reply(weatherReport);
            } catch (error) {
                console.error("解析错误:", error);
                console.error("接收到的数据:", data); // 打印接收到的数据用于调试
                await s.reply("解析天气数据失败，请稍后再试。");
            }
        });
    }).on('error', async (error) => {
        console.error("请求错误:", error);
        await s.reply("天气查询失败，请稍后再试。");
    });

    // 插件运行结束时，如果返回 'next'，则继续向下匹配插件，否则只运行当前插件
    return 'next';  // 继续向下匹配插件
}
