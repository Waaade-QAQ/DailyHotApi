// 临时透传探针：验证抖音热榜接口的分类参数行为，验证完成后删除
import type { Context } from "hono";
import type { ListItem, RouterData } from "../types.js";
import { getDyCookies } from "./douyin.js";

interface ProbeItem extends ListItem {
  cookieOk: boolean;
  cookie?: string;
  status?: number;
  upstreamHeaders?: Record<string, string>;
  raw: unknown;
}

export const handleRoute = async (c: Context, _noCache: boolean): Promise<RouterData> => {
  const customUpstream = c.req.query("upstream_url");
  const upstream = customUpstream || "https://www.douyin.com/aweme/v1/web/hot/search/list/";
  const pass = Object.entries(c.req.query())
    .filter(([k]) => !["cache", "limit", "rss", "upstream_url"].includes(k))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  const defaultParams = customUpstream ? "" : "device_platform=webapp&aid=6383&channel=channel_pc_web";
  const params = [defaultParams, pass].filter(Boolean).join("&");
  const sep = upstream.includes("?") ? "&" : "?";
  const url = params ? `${upstream}${sep}${params}` : upstream;

  const cookie = await getDyCookies();
  let status: number | undefined;
  let upstreamHeaders: Record<string, string> = {};
  let raw: unknown;

  try {
    const reqHeaders: Record<string, string> = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      Accept: "application/json, text/plain, */*",
    };
    if (cookie) {
      reqHeaders["Cookie"] = `passport_csrf_token=${cookie}`;
    }
    if (upstream.includes("creator.douyin.com")) {
      reqHeaders["Referer"] = "https://creator.douyin.com/creator-micro/home";
    } else {
      reqHeaders["Referer"] = "https://www.douyin.com/hot";
    }

    const res = await fetch(url, { headers: reqHeaders });
    status = res.status;
    upstreamHeaders = Object.fromEntries(res.headers.entries());
    const text = await res.text();
    try {
      raw = JSON.parse(text);
    } catch {
      raw = text.slice(0, 2000);
    }
  } catch (error) {
    raw = error instanceof Error ? error.message : String(error);
  }

  const item: ProbeItem = {
    id: `${Date.now()}`,
    title: "dyprobe",
    hot: undefined,
    timestamp: Date.now(),
    url,
    mobileUrl: url,
    cookieOk: Boolean(cookie),
    cookie,
    status,
    upstreamHeaders,
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
