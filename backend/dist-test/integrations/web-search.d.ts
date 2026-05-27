export interface WeatherData {
    temperature: number;
    apparent_temp: number;
    humidity: number;
    wind_speed: number;
    condition: string;
    icon: string;
    is_day: boolean;
}
export declare function getOranWeather(): Promise<WeatherData>;
export declare function formatWeatherForContext(w: WeatherData): string;
export interface NewsItem {
    title: string;
    description: string;
    link: string;
    pubDate: string;
    source: string;
}
export declare function getAlgeriaNews(maxPerFeed?: number): Promise<NewsItem[]>;
export declare function formatNewsForContext(news: NewsItem[]): string;
export interface WebSearchResult {
    weather?: WeatherData;
    news?: NewsItem[];
    error?: string;
}
export declare function getContextualInfo(includeNews?: boolean): Promise<WebSearchResult>;
//# sourceMappingURL=web-search.d.ts.map