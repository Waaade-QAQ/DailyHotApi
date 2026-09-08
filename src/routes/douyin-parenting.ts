import type { RouterData, ListContext, RouterResType, ListItem } from "../types.js";
import { config } from "../config.js";
import { get } from "../utils/getData.js";
import { getTime } from "../utils/getTime.js";
import { getCache, setCache } from "../utils/cache.js";
import { getDyCookies } from "./douyin.js";
import logger from "../utils/logger.js";

const CACHE_KEY = "douyin-parenting-data";
const PARENTING_REGEX = /(育儿|亲子|宝宝|宝妈|孕妇|儿童|孩子|产后|带娃|母婴|少儿|幼师|幼儿园)/i;

interface TikHubItem {
  query_id?: string;
  sentence_id?: string;
  id?: string | number;
  word?: string;
  title?: string;
  hot_value?: number;
  hot_score?: number;
  event_time?: string | number;
}

interface TikHubResponse {
  code?: number;
  msg?: string;
  data?: {
    item_list?: TikHubItem[];
    billboard_list?: TikHubItem[];
    word_list?: TikHubItem[];
    data?: {
      item_list?: TikHubItem[];
      billboard_list?: TikHubItem[];
      word_list?: TikHubItem[];
    };
  };
}

interface PublicWordItem {
  sentence_id: string;
  word: string;
  event_time: string | number;
  hot_value: number;
  sentence_tag?: number;
}

interface PublicHotResponse {
  data: {
    word_list: PublicWordItem[];
  };
}

const fetchFromTikHub = async (): Promise<ListItem[]> => {
  if (!config.TIKHUB_API_KEY) {
    throw new Error("TIKHUB_API_KEY is not configured");
  }
  const url =
    "https://api.tikhub.io/api/v1/douyin/creator/fetch_creator_hot_spot_billboard?billboard_tag=19000&hot_search_type=3";
  const result = await get<TikHubResponse>({
    url,
    headers: {
      Authorization: `Bearer ${config.TIKHUB_API_KEY}`,
    },
    noCache: true,
  });

  const rawData = result.data?.data;
  const list: TikHubItem[] =
    rawData?.item_list ||
    rawData?.billboard_list ||
    rawData?.word_list ||
    rawData?.data?.item_list ||
    rawData?.data?.billboard_list ||
    rawData?.data?.word_list ||
    [];

  if (list.length === 0) {
    throw new Error("Empty list returned from TikHub");
  }

  return list.map((v, index) => {
    const id =
      v.query_id || v.sentence_id || (v.id !== undefined ? String(v.id) : `${index + 1}`);
    const title = v.word || v.title || `热点 ${index + 1}`;
    const hot =
      typeof v.hot_value === "number"
        ? v.hot_value
        : typeof v.hot_score === "number"
          ? v.hot_score
          : 0;
    return {
      id,
      title,
      hot,
      timestamp: v.event_time ? getTime(v.event_time) : undefined,
      url: `https://www.douyin.com/hot/${id}`,
      mobileUrl: `https://www.douyin.com/hot/${id}`,
    };
  });
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

  return targetList.map((v) => ({
    id: v.sentence_id,
    title: v.word,
    timestamp: getTime(v.event_time),
    hot: v.hot_value,
    url: `https://www.douyin.com/hot/${v.sentence_id}`,
    mobileUrl: `https://www.douyin.com/hot/${v.sentence_id}`,
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
