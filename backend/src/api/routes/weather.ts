import { Router } from 'express';
import { getOranWeather, getAlgeriaNews, formatWeatherForContext } from '../../integrations/web-search.js';

const router = Router();

// GET /api/weather — météo Oran en temps réel
router.get('/', async (_req, res) => {
  try {
    const weather = await getOranWeather();
    res.json({ ...weather, formatted: formatWeatherForContext(weather) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/weather/news — actualités Algérie
router.get('/news', async (_req, res) => {
  try {
    const news = await getAlgeriaNews(5);
    res.json({ count: news.length, items: news });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
