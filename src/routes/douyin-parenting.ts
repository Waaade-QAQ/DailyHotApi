import type { RouterData, ListContext, RouterResType, ListItem } from "../types.js";
import { config } from "../config.js";
import { getCache, setCache } from "../utils/cache.js";
import logger from "../utils/logger.js";
import { fetchSpotsFromTikHub, fetchTopicsFromTikHub } from "./douyin-parenting-sources.js";

// v4：仅使用 TikHub 官方亲子垂类接口（创作热点 billboard_tag=19000、话题 billboard_tag=315）
const CACHE_KEY = "douyin-parenting-data-v4";

const fetchFromDouyin = async (): Promise<ListItem[]> => {
  const [spotsRes, topicsRes] = await Promise.allSettled([
    fetchSpotsFromTikHub(),
    fetchTopicsFromTikHub(),
  ]);
  const spots = spotsRes.status === "fulfilled" ? spotsRes.value : [];
  const topics = topicsRes.status === "fulfilled" ? topicsRes.value : [];

  // 创作热点在前、话题在后，按标题去重
  const seen = new Set<string>();
  const combined: ListItem[] = [];
  for (const item of [...spots, ...topics]) {
    if (item.title && !seen.has(item.title)) {
      seen.add(item.title);
      combined.push(item);
    }
  }
  if (combined.length === 0) {
    throw new Error("No items returned from douyin");
  }
  return combined;
};

const getList = async (): Promise<RouterResType> => {
  const cached = await getCache(CACHE_KEY);
  if (cached) {
    logger.info("💾 [CACHE] douyin-parenting hit cache");
    return {
      fromCache: true,
      updateTime: cached.updateTime,
      data: cached.data as ListItem[],
    };
  }

  let data: ListItem[];
  // 整榜缓存 30 分钟，兼顾新鲜度与 TikHub 计费
  let ttl = Math.min(config.DOUYIN_PARENTING_CACHE_TTL, 1800);

  try {
    data = await fetchFromDouyin();
    logger.info(`✅ [douyin-parenting] fetched ${data.length} items`);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.warn(`⚠️ [douyin-parenting] failed (${errMsg}), falling back to topics`);
    data = await fetchTopicsFromTikHub();
    ttl = Math.min(ttl, 300);
  }

  const updateTime = new Date().toISOString();
  await setCache(CACHE_KEY, { data, updateTime }, ttl);

  return {
    fromCache: false,
    updateTime,
    data,
  };
};

export const handleRoute = async (
  _c: ListContext,
  _noCache: boolean,
): Promise<RouterData> => {
  const listData = await getList();
  return {
    name: "douyin-parenting",
    title: "抖音亲子",
    type: "热榜",
    description: "抖音亲子垂直领域热榜",
    link: "https://www.douyin.com",
    total: listData.data?.length || 0,
    ...listData,
  };
};
