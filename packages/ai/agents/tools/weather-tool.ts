import { createTool } from '@packages/ai-agent';

function mapWeatherCode(code: number | undefined): string {
  switch (code) {
    case 0:
      return '晴朗';
    case 1:
    case 2:
    case 3:
      return '多云';
    case 45:
    case 48:
      return '有雾';
    case 51:
    case 53:
    case 55:
      return '毛毛雨';
    case 56:
    case 57:
      return '冻毛毛雨';
    case 61:
    case 63:
    case 65:
      return '小到大雨';
    case 66:
    case 67:
      return '冻雨';
    case 71:
    case 73:
    case 75:
      return '小到大雪';
    case 77:
      return '雪粒';
    case 80:
    case 81:
    case 82:
      return '阵雨';
    case 85:
    case 86:
      return '阵雪';
    case 95:
      return '雷暴';
    case 96:
    case 99:
      return '强雷暴';
    default:
      return '未知天气';
  }
}

export const WeatherTool = createTool<{ city: string; unit?: 'celsius' | 'fahrenheit' }, { city: string; temperature: number; unit: string; description: string; time?: string }>({
  name: 'get_weather',
  description: '查询指定城市的当前天气（基于 Open-Meteo）',
  parameters: {
    type: 'object',
    properties: {
      city: { type: 'string', description: '城市名称（中文或英文）' },
      unit: { type: 'string', enum: ['celsius', 'fahrenheit'], description: '温度单位（默认 celsius）' }
    },
    required: ['city']
  },
  async execute(params) {
    const city = params.city?.trim();
    if (!city) throw new Error('城市名称不能为空');

    const unit = params.unit === 'fahrenheit' ? 'fahrenheit' : 'celsius';
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=zh&format=json`;
    const geoResp = await fetch(geoUrl);
    if (!geoResp.ok) throw new Error(`地理编码失败: ${geoResp.status}`);
    const geo = await geoResp.json();
    const hit = geo?.results?.[0];
    if (!hit) throw new Error(`未找到城市: ${city}`);

    const { latitude, longitude, name } = hit;
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weathercode&temperature_unit=${unit}`;
    const weatherResp = await fetch(weatherUrl);
    if (!weatherResp.ok) throw new Error(`天气查询失败: ${weatherResp.status}`);
    const weather = await weatherResp.json();
    const temp = weather?.current?.temperature_2m;
    const code = weather?.current?.weathercode;
    const time = weather?.current?.time;

    return {
      city: name || city,
      temperature: typeof temp === 'number' ? temp : Number(temp),
      unit,
      description: mapWeatherCode(code),
      time
    };
  }
});
