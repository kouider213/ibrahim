"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOranWeather = getOranWeather;
exports.formatWeatherForContext = formatWeatherForContext;
exports.getAlgeriaNews = getAlgeriaNews;
exports.formatNewsForContext = formatNewsForContext;
exports.getContextualInfo = getContextualInfo;
const axios_1 = __importDefault(require("axios"));
// ── Météo Oran (Open-Meteo — gratuit, pas de clé API) ─────────
const ORAN_LAT = 35.6971;
const ORAN_LON = -0.6308;
const WMO_CODES = {
    0: { label: 'Ciel dégagé', icon: '☀️' },
    1: { label: 'Principalement dégagé', icon: '🌤️' },
    2: { label: 'Partiellement nuageux', icon: '⛅' },
    3: { label: 'Couvert', icon: '☁️' },
    45: { label: 'Brouillard', icon: '🌫️' },
    48: { label: 'Brouillard givrant', icon: '🌫️' },
    51: { label: 'Bruine légère', icon: '🌦️' },
    61: { label: 'Pluie légère', icon: '🌧️' },
    63: { label: 'Pluie modérée', icon: '🌧️' },
    65: { label: 'Pluie forte', icon: '⛈️' },
    80: { label: 'Averses légères', icon: '🌦️' },
    81: { label: 'Averses modérées', icon: '🌧️' },
    82: { label: 'Averses violentes', icon: '⛈️' },
    95: { label: 'Orage', icon: '⛈️' },
    99: { label: 'Orage avec grêle', icon: '🌩️' },
};
async function getOranWeather() {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${ORAN_LAT}&longitude=${ORAN_LON}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weathercode,is_day&timezone=Africa%2FAlgiers`;
    const { data } = await axios_1.default.get(url, { timeout: 5000 });
    const c = data.current;
    const wmo = WMO_CODES[c.weathercode] ?? { label: 'Inconnu', icon: '❓' };
    return {
        temperature: Math.round(c.temperature_2m),
        apparent_temp: Math.round(c.apparent_temperature),
        humidity: c.relative_humidity_2m,
        wind_speed: Math.round(c.wind_speed_10m),
        condition: wmo.label,
        icon: wmo.icon,
        is_day: c.is_day === 1,
    };
}
function formatWeatherForContext(w) {
    return `MÉTÉO ORAN EN CE MOMENT: ${w.icon} ${w.condition} — ${w.temperature}°C (ressenti ${w.apparent_temp}°C), humidité ${w.humidity}%, vent ${w.wind_speed} km/h`;
}
const NEWS_FEEDS = [
    { url: 'https://www.echoroukonline.com/feed/', source: 'Echourouk' },
    { url: 'https://www.tsa-algerie.com/feed/', source: 'TSA Algérie' },
];
function parseRssItems(xml, source, max = 5) {
    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    while ((match = itemRegex.exec(xml)) !== null && items.length < max) {
        const block = match[1];
        const title = (/<title><!\[CDATA\[(.*?)\]\]><\/title>/.exec(block) ?? /<title>(.*?)<\/title>/.exec(block))?.[1] ?? '';
        const desc = (/<description><!\[CDATA\[(.*?)\]\]><\/description>/.exec(block) ?? /<description>(.*?)<\/description>/.exec(block))?.[1] ?? '';
        const link = /<link>(.*?)<\/link>/.exec(block)?.[1] ?? '';
        const date = /<pubDate>(.*?)<\/pubDate>/.exec(block)?.[1] ?? '';
        if (title) {
            items.push({
                title: title.trim().replace(/<[^>]+>/g, ''),
                description: desc.trim().replace(/<[^>]+>/g, '').slice(0, 200),
                link: link.trim(),
                pubDate: date.trim(),
                source,
            });
        }
    }
    return items;
}
async function getAlgeriaNews(maxPerFeed = 4) {
    const results = await Promise.allSettled(NEWS_FEEDS.map(f => axios_1.default.get(f.url, { timeout: 8000, headers: { 'User-Agent': 'Dzaryx-Bot/1.0' } })
        .then(r => parseRssItems(r.data, f.source, maxPerFeed))));
    return results
        .filter((r) => r.status === 'fulfilled')
        .flatMap(r => r.value);
}
function formatNewsForContext(news) {
    if (news.length === 0)
        return '';
    return `ACTUALITÉS ALGÉRIE (${new Date().toLocaleDateString('fr-DZ')}):\n${news.map(n => `- [${n.source}] ${n.title}`).join('\n')}`;
}
async function getContextualInfo(includeNews = false) {
    try {
        const [weather, news] = await Promise.all([
            getOranWeather().catch(() => undefined),
            includeNews ? getAlgeriaNews(4).catch(() => []) : Promise.resolve(undefined),
        ]);
        return { weather, news: news ?? undefined };
    }
    catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
    }
}
//# sourceMappingURL=web-search.js.map