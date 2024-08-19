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
// https://api.weatherapi.com 自己去这个地址注册获取api秘钥并填入下面这段代码 apiKey = 'api秘钥'; // 使用您提供的 WeatherAPI API 密钥 在下文中找566行
const https = require('https'); // 使用 Node.js 内置的 https 模块

// 中文城市名称与英文名称的映射表
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
    // 其他省份和城市...
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
};

// 天气状况翻译映射
const weatherConditionMapping = {
    "Sunny": "晴",
    "Partly Cloudy": "局部多云",
    "Cloudy": "多云",
    "Overcast": "阴天",
    "Rain": "雨",
    "Drizzle": "毛毛雨",
    "Thunderstorm": "雷暴",
    "Snow": "雪",
    "Fog": "雾",
    "Patchy Rain Nearby": "局部降雨",
    "Light Rain": "小雨",
    "Moderate Rain": "中雨",
    "Heavy Rain": "大雨",
    "Showers": "阵雨",
    "Isolated Thunderstorms": "局部雷暴",
    "Sleet": "雨夹雪",
    "Hail": "冰雹",
    "Windy": "有风",
    "Blizzard": "暴风雪",
    "Tornado": "龙卷风",
    "Dust Storm": "沙尘暴",
    "Heat Wave": "热浪",
    "Cold Wave": "寒潮",
    "Tropical Storm": "热带风暴",
    "Hurricane": "飓风",
    "Freezing Rain": "冻雨",
    "Mist": "薄雾",
    "Smoke": "烟雾",
    "Squall": "阵风",
    "Frost": "霜",
    "Ice": "冰",
    "Clear": "晴朗",
    "Partly Sunny": "局部晴朗",
    "Light Snow": "小雪",
    "Moderate Snow": "中雪",
    "Heavy Snow": "大雪",
    "Freezing Fog": "冰雾",
    "Thundersnow": "雷雪",
    "Sandstorm": "沙暴",
    "Tropical Depression": "热带低气压",
    "Severe Thunderstorm": "强雷暴",
    "Rain Shower": "降雨",
    "Heavy Showers": "大阵雨",
    "Intermittent Rain": "间歇性降雨",
    "Overcast with Rain": "阴天伴随降雨",
    "Overcast with Snow": "阴天伴随降雪",
    "Overcast with Thunderstorms": "阴天伴随雷暴",
    "Flurries": "小雪花",
    "Light Rain Shower": "小阵雨",
    "Heavy Rain Shower": "大阵雨",
    "Rain and Snow Mix": "雨雪混合",
    "Thundery Outbreaks Nearby": "附近有雷暴活动",
    "Heavy Thundershowers": "强雷阵雨",
    "Light Thundershowers": "小雷阵雨",
    "Overcast with Light Rain": "阴天伴随小雨",
    "Overcast with Heavy Rain": "阴天伴随大雨",
    "Overcast with Light Snow": "阴天伴随小雪",
    "Overcast with Heavy Snow": "阴天伴随大雪",
    "Torrential Rain": "倾盆大雨",
    "Patchy Fog": "局部雾",
    "Freezing Drizzle": "冻毛毛雨",
    "Ice Pellets": "冰粒",
    "Smoke Haze": "烟雾弥漫",
    "Heavy Freezing Rain": "大冻雨",
    "Severe Blizzard": "严重暴风雪",
    "Severe Cold Wave": "严重寒潮",
    "Heavy Dust Storm": "大沙尘暴",
    "Light Dust Storm": "小沙尘暴",
    "Tropical Cyclone": "热带气旋",
    "Severe Tropical Storm": "强热带风暴",
    "Light Frost": "小霜",
    "Heavy Frost": "大霜",
    "Thick Fog": "浓雾",
    "Dense Smoke": "浓烟",
    "Chilly": "寒冷",
    "Mild": "温和",
    "Frost Advisory": "霜冻警告",
    "Heat Advisory": "高温警告",
    "Severe Weather Alert": "天气警报",
    "Flood Warning": "洪水警报",
    "High Wind Warning": "强风警告",
    "Air Quality Alert": "空气质量警告",
    "Severe Weather Watch": "天气监测",
    "Drought Warning": "干旱警告",
    "Cold Front": "冷锋",
    "Warm Front": "暖锋",
    "Stationary Front": "静止锋",
    "Occluded Front": "闭合锋",
    "Trough": "槽",
    "Ridge": "脊",
};

// 完整天气状况描述
const completeWeatherConditions = {
    "Sunny": {
        "中文": "晴",
        "描述": "天空晴朗，无云，阳光明媚。"
    },
    "Partly Cloudy": {
        "中文": "局部多云",
        "描述": "天空中有部分云层，阳光透过，通常天气温暖。"
    },
    "Cloudy": {
        "中文": "多云",
        "描述": "天空中云层较多，阳光被遮挡，气温可能稍低。"
    },
    "Overcast": {
        "中文": "阴天",
        "描述": "天空完全被云层覆盖，阳光无法透出，可能会有降雨。"
    },
    "Rain": {
        "中文": "雨",
        "描述": "降水现象，雨水从天空降落，可能伴随雷电。"
    },
    "Drizzle": {
        "中文": "毛毛雨",
        "描述": "细小的雨滴，降水量较少，通常不影响活动。"
    },
    "Thunderstorm": {
        "中文": "雷暴",
        "描述": "伴随雷声和闪电的强降雨，可能有大风和冰雹。"
    },
    "Snow": {
        "中文": "雪",
        "描述": "雪花从天空降落，覆盖地面，通常导致气温降低。"
    },
    "Fog": {
        "中文": "雾",
        "描述": "能见度低，空气中水汽凝结成微小水滴，影响视线。"
    },
    "Patchy Rain Nearby": {
        "中文": "局部降雨",
        "描述": "在某些区域有降雨，其他区域可能是干燥的。"
    },
    "Light Rain": {
        "中文": "小雨",
        "描述": "降水量较少的雨，通常持续时间短。"
    },
    "Moderate Rain": {
        "中文": "中雨",
        "描述": "降水量适中，可能需要携带雨具。"
    },
    "Heavy Rain": {
        "中文": "大雨",
        "描述": "降水量大，可能导致积水和交通影响。"
    },
    "Showers": {
        "中文": "阵雨",
        "描述": "短时间内的强降雨，通常伴随云层的变化。"
    },
    "Isolated Thunderstorms": {
        "中文": "局部雷暴",
        "描述": "在某些区域可能出现雷暴，其他区域则为晴朗。"
    },
    "Sleet": {
        "中文": "雨夹雪",
        "描述": "降水形式为雨和雪的混合，可能导致路面滑。"
    },
    "Hail": {
        "中文": "冰雹",
        "描述": "降落的冰块，可能对农作物和车辆造成损害。"
    },
    "Windy": {
        "中文": "有风",
        "描述": "风速较大，可能影响户外活动。"
    },
    "Blizzard": {
        "中文": "暴风雪",
        "描述": "大雪伴随强风，能见度极低，交通受阻。"
    },
    "Tornado": {
        "中文": "龙卷风",
        "描述": "强烈的旋风，具有破坏性，通常伴随雷暴。"
    },
    "Dust Storm": {
        "中文": "沙尘暴",
        "描述": "由于强风卷起沙土，能见度极低，空气质量差。"
    },
    "Heat Wave": {
        "中文": "热浪",
        "描述": "持续高温天气，可能对健康造成影响。"
    },
    "Cold Wave": {
        "中文": "寒潮",
        "描述": "气温骤降，通常伴随强风和低温天气。"
    },
    "Tropical Storm": {
        "中文": "热带风暴",
        "描述": "强烈的热带气旋，伴随强风和降雨。"
    },
    "Hurricane": {
        "中文": "飓风",
        "描述": "强烈的热带气旋，具有毁灭性，影响范围广。"
    },
    "Freezing Rain": {
        "中文": "冻雨",
        "描述": "降水在接触地面后结冰，导致路面滑。"
    },
    "Mist": {
        "中文": "薄雾",
        "描述": "能见度降低，但比雾要好，通常在早晨出现。"
    },
    "Smoke": {
        "中文": "烟雾",
        "描述": "空气中有烟尘，通常由于火灾或工业排放。"
    },
    "Squall": {
        "中文": "阵风",
        "描述": "短时间内的强风，通常伴随降雨或降雪。"
    },
    "Frost": {
        "中文": "霜",
        "描述": "在冷空气中，水汽凝结形成的冰晶，通常在早晨出现。"
    },
    "Ice": {
        "中文": "冰",
        "描述": "水结成固体，通常在低温环境下形成。"
    },
    "Clear": {
        "中文": "晴朗",
        "描述": "天空无云，阳光直射。"
    },
    "Partly Sunny": {
        "中文": "局部晴朗",
        "描述": "天空中有些云，但阳光仍然可见。"
    },
    "Light Snow": {
        "中文": "小雪",
        "描述": "降水量少的雪，通常不会造成积雪。"
    },
    "Moderate Snow": {
        "中文": "中雪",
        "描述": "降水量适中的雪，可能导致地面覆盖白雪。"
    },
    "Heavy Snow": {
        "中文": "大雪",
        "描述": "降水量大的雪，通常会造成交通和活动影响。"
    },
    "Freezing Fog": {
        "中文": "冰雾",
        "描述": "雾在低温下凝结成冰，可能导致路面滑。"
    },
    "Thundersnow": {
        "中文": "雷雪",
        "描述": "伴随雷声的降雪，通常较为少见。"
    },
    "Sandstorm": {
        "中文": "沙暴",
        "描述": "强风卷起沙尘，能见度低，空气质量差。"
    },
    "Tropical Depression": {
        "中文": "热带低气压",
        "描述": "强度较弱的热带气旋，可能伴随降雨。"
    },
    "Severe Thunderstorm": {
        "中文": "强雷暴",
        "描述": "伴随强降雨、雷电和可能的冰雹。"
    },
    "Rain Shower": {
        "中文": "降雨",
        "描述": "短时间内的降雨，通常强度较小。"
    },
    "Heavy Showers": {
        "中文": "大阵雨",
        "描述": "短时间内的强降雨，可能导致积水。"
    },
    "Intermittent Rain": {
        "中文": "间歇性降雨",
        "描述": "降雨和干燥交替出现。"
    },
    "Overcast with Rain": {
        "中文": "阴天伴随降雨",
        "描述": "天空阴暗，伴随持续降雨。"
    },
    "Overcast with Snow": {
        "中文": "阴天伴随降雪",
        "描述": "天空阴暗，伴随持续降雪。"
    },
    "Overcast with Thunderstorms": {
        "中文": "阴天伴随雷暴",
        "描述": "天空阴暗，伴随雷暴天气。"
    },
    "Flurries": {
        "中文": "小雪花",
        "描述": "轻微的降雪，通常不会积雪。"
    },
    "Light Rain Shower": {
        "中文": "小阵雨",
        "描述": "短时间内的小雨，通常不会造成积水。"
    },
    "Heavy Rain Shower": {
        "中文": "大阵雨",
        "描述": "短时间内的强降雨，可能导致积水。"
    },
    "Rain and Snow Mix": {
        "中文": "雨雪混合",
        "描述": "降水形式为雨和雪的混合，通常在温度接近冰点时出现。"
    },
    "Thundery Outbreaks Nearby": {
        "中文": "附近有雷暴活动",
        "描述": "在某些区域可能出现雷暴，其他区域则为晴朗。"
    },
    "Heavy Thundershowers": {
        "中文": "强雷阵雨",
        "描述": "伴随强降雨和雷电的天气现象。"
    },
    "Light Thundershowers": {
        "中文": "小雷阵雨",
        "描述": "降水量较少的雷阵雨。"
    },
    "Overcast with Light Rain": {
        "中文": "阴天伴随小雨",
        "描述": "天空阴暗，伴随小雨。"
    },
    "Overcast with Heavy Rain": {
        "中文": "阴天伴随大雨",
        "描述": "天空阴暗，伴随强降雨。"
    },
    "Overcast with Light Snow": {
        "中文": "阴天伴随小雪",
        "描述": "天空阴暗，伴随小雪。"
    },
    "Overcast with Heavy Snow": {
        "中文": "阴天伴随大雪",
        "描述": "天空阴暗，伴随强降雪。"
    },
    "Torrential Rain": {
        "中文": "倾盆大雨",
        "描述": "极强的降雨，通常会导致严重的积水。"
    },
    "Patchy Fog": {
        "中文": "局部雾",
        "描述": "能见度降低的雾霭，通常在某些区域较为明显。"
    },
    "Freezing Drizzle": {
        "中文": "冻毛毛雨",
        "描述": "细雨在低温下结冰，导致路面滑。"
    },
    "Ice Pellets": {
        "中文": "冰粒",
        "描述": "小冰块降落，通常在雨夹雪的情况下出现。"
    },
    "Smoke Haze": {
        "中文": "烟雾弥漫",
        "描述": "由于火灾或其他原因，空气中有烟雾，能见度降低。"
    },
    "Heavy Freezing Rain": {
        "中文": "大冻雨",
        "描述": "大量的冻雨，导致路面和树木结冰，可能造成危险。"
    },
    "Severe Blizzard": {
        "中文": "严重暴风雪",
        "描述": "伴随强风和大雪的极端天气，能见度极低。"
    },
    "Severe Cold Wave": {
        "中文": "严重寒潮",
        "描述": "气温骤降，伴随强风和低温天气。"
    },
    "Heavy Dust Storm": {
        "中文": "大沙尘暴",
        "描述": "强风卷起大量沙尘，能见度极低。"
    },
    "Light Dust Storm": {
        "中文": "小沙尘暴",
        "描述": "较小的沙尘暴，能见度下降，但影响相对较小。"
    },
    "Tropical Cyclone": {
        "中文": "热带气旋",
        "描述": "强烈的热带风暴，伴随强风和降雨。"
    },
    "Severe Tropical Storm": {
        "中文": "强热带风暴",
        "描述": "强烈的热带风暴，可能造成严重影响。"
    },
    "Light Frost": {
        "中文": "小霜",
        "描述": "轻微的霜冻，通常在早晨出现。"
    },
    "Heavy Frost": {
        "中文": "大霜",
        "描述": "较强的霜冻，可能影响农作物。"
    },
};

// 示例使用
const weatherDescription = "Thundery Outbreaks Nearby";
const translatedWeather = completeWeatherConditions[weatherDescription] ? completeWeatherConditions[weatherDescription].中文 : "未知天气状况";
const weatherDetail = completeWeatherConditions[weatherDescription] ? completeWeatherConditions[weatherDescription].描述 : "无详细描述";

console.log(`天气状况: ${translatedWeather}`); // 输出: 天气状况: 附近有雷暴活动
console.log(`天气描述: ${weatherDetail}`); // 输出: 天气描述: 在某些区域可能出现雷暴，其他区域则为晴朗。

// 导出模块
module.exports = async s => {
    // 获取用户输入的城市名
    const cityInput = s.param(1).trim();  // 获取输入并去除多余空格

    // 检查是否为中文城市名称并转换为英文
    const city = Object.keys(cityMapping).includes(cityInput) ? Object.keys(cityMapping[cityInput])[0] : cityInput; // 如果映射表中存在则转换，否则使用原输入

    // 构造请求 URL
    const apiKey = 'api秘钥'; // 使用您提供的 WeatherAPI API 密钥
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
