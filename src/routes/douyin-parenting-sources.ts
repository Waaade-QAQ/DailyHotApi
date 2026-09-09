import type { ListItem } from "../types.js";
import { config } from "../config.js";
import { get } from "../utils/getData.js";
import { getTime } from "../utils/getTime.js";
import { getCache, setCache } from "../utils/cache.js";

// TikHub 创作热点词（每日快照）走 1h 独立缓存，控制计费
const SPOT_CACHE_KEY = "douyin-parenting-spots-v4";

const searchUrl = (keyword: string) =>
  `https://www.douyin.com/search/${encodeURIComponent(keyword)}?type=general`;

/**
 * TikHub 创作热点词条（billboard_tag=19000 = 官方枚举「亲子 / Parenting」）
 */
interface TikHubSpotItem {
  query_id?: string;
  sentence_id?: string;
  title?: string;
  word?: string;
  hot_value?: number;
  hot_score?: number;
  category?: string;
  cover?: { url_list?: string[] };
  aweme_list?: Array<{ aweme_id?: string | number }>;
}

interface TikHubSpotResponse {
  data?: { item_list?: TikHubSpotItem[]; billboard_list?: TikHubSpotItem[] };
}

/**
 * TikHub 亲子话题榜条目（billboard_tag=315 = 官方枚举「亲子 / Parenting」）
 */
interface TikHubTopicItem {
  item_id?: string | number;
  query_id?: string;
  title?: string;
  word?: string;
  play_count?: number;
  hot_score?: number;
  event_time?: string | number;
}

interface TikHubTopicResponse {
  data?: { item_list?: TikHubTopicItem[]; billboard_list?: TikHubTopicItem[] };
}

/**
 * 创作热点：billboard_tag=19000（亲子），hot_search_type=3（上升榜，最动态）
 */
export const fetchSpotsFromTikHub = async (): Promise<ListItem[]> => {
  if (!config.TIKHUB_API_KEY) return [];
  const cached = await getCache(SPOT_CACHE_KEY);
  if (cached) return cached.data as ListItem[];

  const url =
    "https://api.tikhub.io/api/v1/douyin/creator/fetch_creator_hot_spot_billboard?billboard_tag=19000&hot_search_type=3";
  const result = await get<TikHubSpotResponse>({
    url,
    headers: { Authorization: `Bearer ${config.TIKHUB_API_KEY}` },
    noCache: true,
  });
  const raw = result.data?.data;
  const list = raw?.item_list || raw?.billboard_list || [];
  const items = list.map((v, i): ListItem => {
    const id = v.query_id || v.sentence_id || `${i + 1}`;
    const title = v.word || v.title || `热点 ${i + 1}`;
    const videoId = v.aweme_list?.find((a) => a.aweme_id)?.aweme_id;
    const isVideo = videoId !== undefined && videoId !== null;
    return {
      id,
      title,
      hot: v.hot_value ?? v.hot_score ?? 0,
      kind: "spot",
      source: "creator",
      category: v.category,
      cover: v.cover?.url_list?.[0],
      timestamp: undefined,
      url: isVideo
        ? `https://www.douyin.com/video/${videoId}`
        : searchUrl(title),
      mobileUrl: isVideo
        ? `snssdk1128://aweme/detail/${videoId}`
        : searchUrl(title),
    };
  });
  if (items.length > 0) {
    await setCache(
      SPOT_CACHE_KEY,
      { data: items, updateTime: new Date().toISOString() },
      3600,
    );
  }
  return items;
};

/**
 * 亲子话题榜：billboard_tag=315（亲子），order_key=1（播放最高）、time_filter=1（近 24h）
 */
export const fetchTopicsFromTikHub = async (): Promise<ListItem[]> => {
  if (!config.TIKHUB_API_KEY) return [];
  const url =
    "https://api.tikhub.io/api/v1/douyin/creator/fetch_creator_hot_topic_billboard?billboard_tag=315&order_key=1&time_filter=1";
  const result = await get<TikHubTopicResponse>({
    url,
    headers: { Authorization: `Bearer ${config.TIKHUB_API_KEY}` },
    noCache: true,
  });
  const raw = result.data?.data;
  const list = raw?.item_list || raw?.billboard_list || [];
  return list.map((v, i): ListItem => {
    const id = v.item_id !== undefined ? String(v.item_id) : (v.query_id || `${i + 1}`);
    const title = v.title || v.word || `话题 ${i + 1}`;
    const hot = v.play_count ?? v.hot_score ?? 0;
    const hashtagId = String(v.item_id ?? "");
    const useHashtag = hashtagId.length >= 10;
    return {
      id,
      title,
      hot,
      kind: "topic",
      timestamp: v.event_time ? getTime(v.event_time) : undefined,
      url: useHashtag
        ? `https://www.douyin.com/hashtag/${hashtagId}`
        : searchUrl(title),
      mobileUrl: useHashtag
        ? `snssdk1128://challenge/detail/${hashtagId}`
        : searchUrl(title),
    };
  });
};
