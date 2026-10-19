import type { Context } from "hono";
import type { ResponseType } from "axios";

// Context
export type ListContext = Context;

// 榜单数据
export interface ListItem {
  id: number | string;
  title: string;
  cover?: string;
  author?: string;
  desc?: string;
  hot: number | undefined;
  timestamp: number | undefined;
  url: string;
  mobileUrl: string;
  // douyin-parenting: 条目类型（创作热点词条 / 亲子话题）
  kind?: "spot" | "topic";
  // douyin-parenting: 创作热点所属领域分类（如「母婴」「亲子」）
  category?: string;
  // douyin-parenting: spot 来源（official 官方实时热搜 / creator 创作者中心快照）
  source?: "official" | "creator";
}

// 路由接口数据
export interface RouterResType {
  updateTime: string | number;
  fromCache: boolean;
  data: ListItem[];
  message?: string;
}

// spring-festival: 年份与四天元数据
export interface FestivalYearMeta {
  year: number;
  lunar: string;
  days: { date: string; label: string }[];
}

// 路由数据
export interface RouterData extends RouterResType {
  name: string;
  title: string;
  type: string;
  description?: string;
  params?: Record<string, string | object>;
  total: number;
  link?: string;
  // spring-festival: 年份列表，供前端渲染年份切换
  meta?: { years: FestivalYearMeta[] };
}

// 请求类型
export interface Get {
  url: string;
  headers?: Record<string, string | string[]>;
  params?: Record<string, string | number>;
  timeout?: number;
  noCache?: boolean;
  ttl?: number;
  originaInfo?: boolean;
  responseType?: ResponseType;
}

export interface Post {
  url: string;
  headers?: Record<string, string | string[]>;
  body?: string | object | Buffer | undefined;
  timeout?: number;
  noCache?: boolean;
  ttl?: number;
  originaInfo?: boolean;
}

// 参数类型
export interface Options {
  [key: string]: string | number | undefined;
}
