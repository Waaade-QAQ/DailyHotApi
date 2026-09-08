import type { RouterData } from "../types.js";
import { get } from "../utils/getData.js";
import { getTime } from "../utils/getTime.js";

export const handleRoute = async (_: undefined, noCache: boolean) => {
  const listData = await getList(noCache);
  const routeData: RouterData = {
    name: "earthquake",
    title: "中国地震台",
    type: "地震速报",
    link: "https://www.ceic.ac.cn/",
    total: listData.data?.length || 0,
    ...listData,
  };
  return routeData;
};

interface EarthquakeItem {
  id: string;
  time: string;
  latitude: number;
  longitude: number;
  depth: number;
  magnitude: number;
  location: string;
}

const getList = async (noCache: boolean) => {
  const url = `https://www.ceic.ac.cn/data/data.json`;
  const result = await get<EarthquakeItem[]>({ url, noCache });
  const list = Array.isArray(result.data) ? result.data : [];
  return {
    ...result,
    data: list.slice(0, 50).map((v) => {
      const { id, location, magnitude, time, latitude, longitude, depth } = v;
      const desc = [
        `发震时刻(UTC+8)：${time}`,
        `参考位置：${location}`,
        `震级(M)：${magnitude}`,
        `纬度(°)：${latitude}`,
        `经度(°)：${longitude}`,
        `深度(千米)：${depth}`,
      ].join("\n");
      return {
        id,
        title: `${location}发生${magnitude}级地震`,
        desc,
        timestamp: getTime(time),
        hot: undefined,
        url: `https://www.ceic.ac.cn/`,
        mobileUrl: `https://www.ceic.ac.cn/`,
      };
    }),
  };
};
