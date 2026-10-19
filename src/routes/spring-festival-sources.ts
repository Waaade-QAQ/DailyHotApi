import type { ListItem } from "../types.js";
import { get } from "../utils/getData.js";

// 农历正月初一对应的公历日期（2020–2040，由农历算法生成，与公开年表一致）
const SPRING_FESTIVAL_DATES: Record<number, string> = {
  2020: "2020-01-25",
  2021: "2021-02-12",
  2022: "2022-02-01",
  2023: "2023-01-22",
  2024: "2024-02-10",
  2025: "2025-01-29",
  2026: "2026-02-17",
  2027: "2027-02-06",
  2028: "2028-01-26",
  2029: "2029-02-13",
  2030: "2030-02-03",
  2031: "2031-01-23",
  2032: "2032-02-11",
  2033: "2033-01-31",
  2034: "2034-02-19",
  2035: "2035-02-08",
  2036: "2036-01-28",
  2037: "2037-02-15",
  2038: "2038-02-04",
  2039: "2039-01-24",
  2040: "2040-02-12",
};

const HEAVENLY_STEMS = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"];
const EARTHLY_BRANCHES = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
const ZODIACS = ["鼠", "牛", "虎", "兔", "龙", "蛇", "马", "羊", "猴", "鸡", "狗", "猪"];

// 每年最多保留的条数，控制返回体积
const MAX_ITEMS_PER_DAY = 12;

export interface FestivalDay {
  date: string;
  label: string;
}

export interface FestivalYear {
  year: number;
  lunar: string;
  days: FestivalDay[];
}

/** 天干地支 + 生肖，如 2026 → 丙午马年 */
export const lunarName = (year: number): string => {
  const stem = HEAVENLY_STEMS[(year - 4) % 10];
  const branch = EARTHLY_BRANCHES[(year - 4) % 12];
  const zodiac = ZODIACS[(year - 4) % 12];
  return `${stem}${branch}${zodiac}年`;
};

const shiftDate = (iso: string, offsetDays: number): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
};

/** 除夕前、除夕、正月初一、正月初二 */
const fourDays = (cnyDate: string): FestivalDay[] => [
  { date: shiftDate(cnyDate, -2), label: "除夕前" },
  { date: shiftDate(cnyDate, -1), label: "除夕" },
  { date: cnyDate, label: "正月初一" },
  { date: shiftDate(cnyDate, 1), label: "正月初二" },
];

/** 取今天之前最近若干个春节，最新的一年排在最前 */
export const recentFestivals = (today: string, count = 2): FestivalYear[] =>
  Object.entries(SPRING_FESTIVAL_DATES)
    .filter(([, date]) => date <= today)
    .sort((a, b) => Number(b[0]) - Number(a[0]))
    .slice(0, count)
    .map(([year, date]) => ({
      year: Number(year),
      lunar: lunarName(Number(year)),
      days: fourDays(date),
    }));

// 微博热搜按天归档：archives/{YYYYMM}/{YYYY-MM-DD}.md
const WEIBO_BASE = "https://raw.githubusercontent.com/v5tech/weibo-trending-hot-search/master/archives";
// 抖音热搜按天归档：archives/抖音/{YYYY}/{MM}/{YYYY-MM-DD}.md
const DOUYIN_BASE = "https://raw.githubusercontent.com/iiecho1/hot_searches_for_apps/main/archives";

const fetchArchive = async (url: string): Promise<string> => {
  const res = await get<string>({
    url,
    responseType: "text",
    // 历史归档不会再变，长缓存减少对 GitHub 的重复拉取
    ttl: 86400 * 7,
  });
  return String(res.data);
};

export const fetchWeibo = async (date: string): Promise<ListItem[]> => {
  const [year, month] = date.split("-");
  const text = await fetchArchive(`${WEIBO_BASE}/${year}${month}/${date}.md`);
  return [...text.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)\s+(\d+)/g)]
    .slice(0, MAX_ITEMS_PER_DAY)
    .map((m, i) => ({
      id: `${date}-weibo-${i + 1}`,
      title: m[1].trim(),
      hot: Number(m[3]) as number | undefined,
      timestamp: undefined,
      url: m[2],
      mobileUrl: m[2],
    }));
};

export const fetchDouyin = async (date: string): Promise<ListItem[]> => {
  const [year, month] = date.split("-");
  const path = `${encodeURIComponent("抖音")}/${year}/${month}/${date}.md`;
  const text = await fetchArchive(`${DOUYIN_BASE}/${path}`);
  return [...text.matchAll(/\+ \[([^\]]+)\]\((https?:\/\/[^)]+)\)/g)]
    .slice(0, MAX_ITEMS_PER_DAY)
    .map((m, i) => ({
      id: `${date}-douyin-${i + 1}`,
      title: m[1].trim(),
      hot: undefined,
      timestamp: undefined,
      url: m[2],
      mobileUrl: m[2],
    }));
};
