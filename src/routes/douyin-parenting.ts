import type { RouterData, ListContext, RouterResType, ListItem } from "../types.js";
import { config } from "../config.js";
import { get } from "../utils/getData.js";
import { getTime } from "../utils/getTime.js";
import { getCache, setCache } from "../utils/cache.js";
import { getDyCookies } from "./douyin.js";
import logger from "../utils/logger.js";

const CACHE_KEY = "douyin-parenting-data";
const PARENTING_REGEX = /(育儿|亲子|宝宝|宝妈|孕妇|儿童|孩子|产后|带娃|母婴|少儿|幼师|幼儿园)/i;

/**
 * 创作热点（hot_spot）榜单条目原始结构（字段均可选，缺失时按 undefined 处理）
 */
interface TikHubSpotItem {
  query_id?: string;
  sentence_id?: string;
  title?: string;
  word?: string;
  hot_value?: number;
  hot_score?: number;
  category?: string;
  rank_diff?: number;
  cover?: { url_list?: string[] };
  aweme_list?: Array<{ aweme_id?: string | number }>;
}

/**
 * 亲子话题（hot_topic）榜单条目原始结构
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

interface TikHubSpotResponse {
  data?: { item_list?: TikHubSpotItem[]; billboard_list?: TikHubSpotItem[] };
}

interface TikHubTopicResponse {
  data?: { item_list?: TikHubTopicItem[]; billboard_list?: TikHubTopicItem[] };
}

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

const searchUrl = (keyword: string) =>
  `https://www.douyin.com/search/${encodeURIComponent(keyword)}?type=general`;

const fetchSpotsFromTikHub = async (): Promise<ListItem[]> => {
  if (!config.TIKHUB_API_KEY) return [];
  // billboard_tag=19000 为「母婴亲子」领域创作热点；hot_search_type=3 为热点上升榜
  const url =
    "https://api.tikhub.io/api/v1/douyin/creator/fetch_creator_hot_spot_billboard?billboard_tag=19000&hot_search_type=3";
  const result = await get<TikHubSpotResponse>({
    url,
    headers: { Authorization: `Bearer ${config.TIKHUB_API_KEY}` },
    noCache: true,
  });
  const raw = result.data?.data;
  const list = raw?.item_list || raw?.billboard_list || [];
  return list.map((v, i): ListItem => {
    const id = v.query_id || v.sentence_id || `${i + 1}`;
    const title = v.word || v.title || `热点 ${i + 1}`;
    const hot = v.hot_value ?? v.hot_score ?? 0;
    const videoId = v.aweme_list?.find((a) => a.aweme_id)?.aweme_id;
    const isVideo = videoId !== undefined && videoId !== null;
    return {
      id,
      title,
      hot,
      kind: "spot",
      category: v.category,
      cover: v.cover?.url_list?.[0],
      timestamp: undefined,
      // 词条若带具体视频则直达视频页，否则落抖音搜索
      url: isVideo
        ? `https://www.douyin.com/video/${videoId}`
        : searchUrl(title),
      mobileUrl: isVideo
        ? `snssdk1128://aweme/detail/${videoId}`
        : searchUrl(title),
    };
  });
};

const fetchTopicsFromTikHub = async (): Promise<ListItem[]> => {
  if (!config.TIKHUB_API_KEY) return [];
  // billboard_tag=315 官方领域名为「亲子」；order_key=1 播放最高、time_filter=1 近 24 小时
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
      // 话题条目直达官方话题聚合页 / 抖音 App 挑战详情
      url: useHashtag ? `https://www.douyin.com/hashtag/${hashtagId}` : searchUrl(title),
      mobileUrl: useHashtag
        ? `snssdk1128://challenge/detail/${hashtagId}`
        : searchUrl(title),
    };
  });
};

const fetchFromTikHub = async (): Promise<ListItem[]> => {
  const [spotsRes, topicsRes] = await Promise.allSettled([
    fetchSpotsFromTikHub(),
    fetchTopicsFromTikHub(),
  ]);
  const spots = spotsRes.status === "fulfilled" ? spotsRes.value : [];
  const topics = topicsRes.status === "fulfilled" ? topicsRes.value : [];

  const seen = new Set<string>();
  const combined: ListItem[] = [];
  for (const item of [...spots, ...topics]) {
    if (item.title && !seen.has(item.title)) {
      seen.add(item.title);
      combined.push(item);
    }
  }
  if (combined.length === 0) {
    throw new Error("No items returned from TikHub");
  }
  return combined;
};

const fetchFallbackList = async (): Promise<ListItem[]> => {
  const url =
    "https://www.douyin.com/aweme/v1/web/hot/search/list/?device_platform=webapp&aid=6383&channel=channel_pc_web&detail_list=1";
  const cookie = await getDyCookies();
  const result = await get<PublicHotResponse>({
    url,
    noCache: false,
    headers: {
      Cookie: `passport_csrf_token=${cookie ?? ""}`,
    },
  });

  const wordList = result.data?.data?.word_list || [];
  const filtered = wordList.filter(
    (v) => v.sentence_tag === 19000 || PARENTING_REGEX.test(v.word),
  );
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
  let ttl = config.DOUYIN_PARENTING_CACHE_TTL;

  try {
    data = await fetchFromTikHub();
    logger.info(`✅ [TikHub] douyin-parenting fetched ${data.length} items`);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.warn(`⚠️ [TikHub] failed (${errMsg}), switching to public fallback`);
    data = await fetchFallbackList();
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
