// 临时透传探针：验证抖音热榜接口的分类参数行为，验证完成后删除
import type { Context } from "hono";
import { AxiosError } from "axios";
import { get } from "../utils/getData.js";
import type { ListItem, RouterData } from "../types.js";

interface DyCookieResponse {
  headers: {
    "set-cookie": string[];
  };
}

interface ProbeItem extends ListItem {
  cookieOk: boolean;
  raw: unknown;
}

// 获取抖音临时 Cookie
const getDyCookies = async (): Promise<string | undefined> => {
  try {
    const cookisUrl = "https://www.douyin.com/passport/general/login_guiding_strategy/?aid=6383";
    const { data } = await get<DyCookieResponse>({ url: cookisUrl, originaInfo: true });
    const pattern = /passport_csrf_token=(.*); Path/s;
    const matchResult = data.headers["set-cookie"][0].match(pattern);
    return matchResult?.[1];
  } catch (error) {
    console.error("获取抖音 Cookie 出错" + error);
    return undefined;
  }
};

export const handleRoute = async (c: Context, noCache: boolean): Promise<RouterData> => {
  const customUpstream = c.req.query("upstream_url");
  const upstream = customUpstream || "https://www.douyin.com/aweme/v1/web/hot/search/list/";
  // 除缓存/条数控制外，透传全部查询参数给上游，探测 category_id 等分类参数
  const pass = Object.entries(c.req.query())
    .filter(([k]) => !["cache", "limit", "rss", "upstream_url"].includes(k))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  const defaultParams = customUpstream ? "" : "device_platform=webapp&aid=6383&channel=channel_pc_web";
  const params = [defaultParams, pass].filter(Boolean).join("&");
  const sep = upstream.includes("?") ? "&" : "?";
  const url = params ? `${upstream}${sep}${params}` : upstream;

  const cookie = await getDyCookies();
  let raw: unknown;
  try {
    const headers: Record<string, string> = {};
    if (cookie) {
      headers["Cookie"] = `passport_csrf_token=${cookie}`;
    }
    if (upstream.includes("creator.douyin.com")) {
      headers["Referer"] = "https://creator.douyin.com/creator-micro/home";
    }
    const result = await get<unknown>({
      url,
      noCache,
      headers: Object.keys(headers).length ? headers : undefined,
    });
    raw = result.data;
  } catch (error) {
    raw = error instanceof AxiosError ? error.response?.data : String(error);
  }
  const item: ProbeItem = {
    id: `${Date.now()}`,
    title: "dyprobe",
    hot: undefined,
    timestamp: Date.now(),
    url,
    mobileUrl: url,
    cookieOk: Boolean(cookie),
    raw,
  };
  return {
    name: "dyprobe",
    title: "抖音探针",
    type: "探针",
    description: "临时透传探针，验证后删除",
    link: "https://www.douyin.com/hot",
    updateTime: new Date().toISOString(),
    fromCache: false,
    total: 1,
    data: [item],
  };
};
