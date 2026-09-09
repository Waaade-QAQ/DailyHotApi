import type { ListItem } from "../types.js";
import { config } from "../config.js";
import { get } from "../utils/getData.js";
import { getTime } from "../utils/getTime.js";
import { getCache, setCache } from "../utils/cache.js";
import { getDyCookies } from "./douyin.js";

// TikHub 创作热点词（每日快照，更新慢）走 1h 独立缓存，控制计费
const SPOT_CACHE_KEY = "douyin-parenting-spots-v3";
const PARENTING_REGEX =
  /(育儿|亲子|宝宝|宝妈|宝爸|孕妇|孕晚期|儿童|孩子|产后|哺乳|带娃|母婴|少儿|幼师|幼儿园|胎教|早教|辅食|奶爸|萌娃|奶娃|育婴|托育|亲子互动|亲子阅读|亲子运动)/i;

const searchUrl = (keyword: string) =>
  `https://www.douyin.com/search/${encodeURIComponent(keyword)}?type=general`;

/**
 * 官方抖音热搜条目（word_list；sentence_tag===19000 为亲子/母婴分类）
 */
interface PublicWordItem {
  sentence_id: string;
  word: string;
  event_time: string | number;
  hot_value: number;
  sentence_tag?: number;
}

interface PublicHotResponse {
  data: { word_list: PublicWordItem[] };
}

/**
 * TikHub 创作热点词条
 */
interface TikHubSpotItem {
  query_id?: string;
  sentence_id?: string;
  title?: string;
  word?: string;
  hot_value?: number;
  hot_score?: number;
}

interface TikHubSpotResponse {
  data?: { item_list?: TikHubSpotItem[]; billboard_list?: TikHubSpotItem[] };
}

/**
 * TikHub 亲子话题榜条目（billboard_tag=315 官方名为「亲子」）
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
 * 官方抖音热搜（免费、实时刷新），按亲子/母婴 sentence_tag + 关键词双重过滤
 */
export const fetchOfficialSpotList = async (): Promise<ListItem[]> => {
  const url =
    "https://www.douyin.com/aweme/v1/web/hot/search/list/?device_platform=webapp&aid=6383&channel=channel_pc_web&detail_list=1";
  const cookie = await getDyCookies();
  const result = await get<PublicHotResponse>({
    url,
    noCache: false,
    // 官方热搜分钟级变化：URL 层缓存仅 5 分钟，由路由 30 分钟 TTL 主导刷新
    ttl: 300,
    headers: { Cookie: `passport_csrf_token=${cookie ?? ""}` },
  });

  const wordList = result.data?.data?.word_list || [];
  const filtered = wordList.filter(
    (v) => v.sentence_tag === 19000 || PARENTING_REGEX.test(v.word),
  );
  // 相关词太少时兜底取全网前 15，保证榜单可用
  const targetList = filtered.length > 0 ? filtered : wordList.slice(0, 15);

  return targetList.map((v): ListItem => ({
    id: v.sentence_id,
    title: v.word,
    timestamp: getTime(v.event_time),
    hot: v.hot_value,
    kind: "spot",
    url: searchUrl(v.word),
    mobileUrl: searchUrl(v.word),
  }));
};

/**
 * TikHub 创作热点词条（每日快照），独立 1h 缓存
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
    return {
      id,
      title,
      hot: v.hot_value ?? v.hot_score ?? 0,
      kind: "spot",
      timestamp: undefined,
      url: searchUrl(title),
      mobileUrl: searchUrl(title),
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
 * TikHub 亲子话题榜（24h 播放最高），头部为长期大词池
 */
export const fetchTopicsFromTikHub = async (): Promise<ListItem[]> => {
  if (!config.TIKHUB_API_KEY) return [];
  // billboard_tag=315 领域名「亲子」；order_key=1 播放最高、time_filter=1 近 24 小时
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
