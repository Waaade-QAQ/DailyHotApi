import type { RouterData, ListContext, ListItem, FestivalYearMeta } from "../types.js";
import { getCache, setCache } from "../utils/cache.js";
import logger from "../utils/logger.js";
import {
  recentFestivals,
  fetchWeibo,
  fetchDouyin,
  type FestivalYear,
} from "./spring-festival-sources.js";

const CACHE_KEY = "spring-festival-data-v1";
// 历史归档不会变化，一天一次即可
const CACHE_TTL = 86400;

type Platform = "weibo" | "douyin";

interface FestivalItem extends ListItem {
  year: number;
  day: string;
  platform: Platform;
}

interface FestivalPayload {
  years: FestivalYear[];
  data: FestivalItem[];
  updateTime: string;
}

interface FetchTask {
  year: number;
  day: string;
  platform: Platform;
  run: () => Promise<ListItem[]>;
}

const buildTasks = (years: FestivalYear[]): FetchTask[] => {
  const tasks: FetchTask[] = [];
  for (const y of years) {
    for (const d of y.days) {
      tasks.push({ year: y.year, day: d.date, platform: "weibo", run: () => fetchWeibo(d.date) });
      tasks.push({ year: y.year, day: d.date, platform: "douyin", run: () => fetchDouyin(d.date) });
    }
  }
  return tasks;
};

/** 并发拉取两年 x 四天 x 两平台，单路失败只丢该天该平台 */
const fetchAll = async (years: FestivalYear[]): Promise<FestivalItem[]> => {
  const tasks = buildTasks(years);
  const results = await Promise.allSettled(tasks.map((t) => t.run()));
  const data: FestivalItem[] = [];
  results.forEach((result, i) => {
    const task = tasks[i];
    if (result.status === "rejected") {
      logger.warn(`⚠️ [spring-festival] ${task.day} ${task.platform} 拉取失败`);
      return;
    }
    for (const item of result.value) {
      data.push({ ...item, year: task.year, day: task.day, platform: task.platform });
    }
  });
  return data;
};

const buildPayload = async (): Promise<FestivalPayload> => {
  const today = new Date().toISOString().slice(0, 10);
  const years = recentFestivals(today, 2);
  const data = await fetchAll(years);
  logger.info(`✅ [spring-festival] ${years.map((y) => y.year).join("+")} 共 ${data.length} 条`);
  return { years, data, updateTime: new Date().toISOString() };
};

const toMeta = (years: FestivalYear[]): { years: FestivalYearMeta[] } => ({
  years: years.map((y) => ({ year: y.year, lunar: y.lunar, days: y.days })),
});

export const handleRoute = async (_c: ListContext, noCache: boolean): Promise<RouterData> => {
  let payload: FestivalPayload;
  let fromCache = false;

  const cached = noCache ? undefined : await getCache(CACHE_KEY);
  if (cached) {
    logger.info("💾 [CACHE] spring-festival hit cache");
    payload = cached.data as FestivalPayload;
    fromCache = true;
  } else {
    payload = await buildPayload();
    if (payload.data.length > 0) {
      // setCache 的 CacheData 为 { updateTime, data }，整体 payload 需放进 data 字段
      await setCache(CACHE_KEY, { data: payload, updateTime: payload.updateTime }, CACHE_TTL);
    }
  }

  return {
    name: "spring-festival",
    title: "春节热搜回顾",
    type: "回顾",
    description: "历年春节前后四天，抖音与微博的新年热搜",
    link: "https://www.douyin.com",
    total: payload.data.length,
    fromCache,
    updateTime: payload.updateTime,
    data: payload.data,
    meta: toMeta(payload.years),
  };
};
