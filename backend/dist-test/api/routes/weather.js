"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const web_search_js_1 = require("../../integrations/web-search.js");
const router = (0, express_1.Router)();
// GET /api/weather — météo Oran en temps réel
router.get('/', async (_req, res) => {
    try {
        const weather = await (0, web_search_js_1.getOranWeather)();
        res.json({ ...weather, formatted: (0, web_search_js_1.formatWeatherForContext)(weather) });
    }
    catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
});
// GET /api/weather/news — actualités Algérie
router.get('/news', async (_req, res) => {
    try {
        const news = await (0, web_search_js_1.getAlgeriaNews)(5);
        res.json({ count: news.length, items: news });
    }
    catch (err) {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
});
exports.default = router;
//# sourceMappingURL=weather.js.map