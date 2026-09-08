import { config } from "./config.js";
import { Hono } from "hono";
import getRSS from "./utils/getRSS.js";
import { routesMap, allRoutes } from "./routes/index.js";
import logger from "./utils/logger.js";

const app = new Hono();

// 已确认无法通过简单修复恢复的接口及废弃原因
const offlineRoutes: Record<string, string> = {
  coolapk: "酷安客户端接口已升级 Native 加密签名（v14+ .so 校验），旧 Token 机制已废弃",
  hostloc: "全球主机交流论坛限制无状态请求，触发防刷机制",
  linuxdo: "Linux.do 已启用 Cloudflare 盾防护，无浏览器环境无法直接访问",
  producthunt: "Product Hunt 已启用 Cloudflare 盾防护，未授权请求被拦截",
};

// 注册全部路由
for (const router of allRoutes) {
  const listApp = app.basePath(`/${router}`);

  // 返回榜单
  listApp.get("/", async (c) => {
    // 检查是否属于下线接口
    if (offlineRoutes[router]) {
      return c.json({ code: 404, message: offlineRoutes[router], data: [] }, 404);
    }

    try {
      // 是否采用缓存
      const noCache = c.req.query("cache") === "false";
      // 限制显示条目
      const limit = c.req.query("limit");
      // 是否输出 RSS
      const rssEnabled = c.req.query("rss") === "true";

      const routeModule = routesMap[router];
      if (!routeModule || !routeModule.handleRoute) {
        return c.json({ code: 404, message: `Route /${router} not found`, data: [] }, 404);
      }

      const listData = await routeModule.handleRoute(c, noCache);

      // 是否限制条目
      if (limit && listData?.data?.length > parseInt(limit)) {
        listData.total = parseInt(limit);
        listData.data = listData.data.slice(0, parseInt(limit));
      }

      // 是否输出 RSS
      if (rssEnabled || config.RSS_MODE) {
        const rss = getRSS(listData);
        if (typeof rss === "string") {
          c.header("Content-Type", "application/xml; charset=utf-8");
          return c.body(rss);
        } else {
          return c.json({ code: 500, message: "RSS generation failed" }, 500);
        }
      }

      return c.json({ code: 200, ...listData });
    } catch (error: any) {
      logger.error(`❌ [ERROR] Route /${router} failed: ${error?.message}`);
      return c.json(
        {
          code: 500,
          message: error?.message || "Internal Server Error",
          data: [],
        },
        500,
      );
    }
  });

  // 请求方式错误
  listApp.all("*", (c) => c.json({ code: 405, message: "Method Not Allowed" }, 405));
}

// 获取全部路由
app.get("/all", (c) =>
  c.json(
    {
      code: 200,
      count: allRoutes.length,
      routes: allRoutes.map((name) => {
        if (offlineRoutes[name]) {
          return {
            name,
            path: null,
            message: offlineRoutes[name],
          };
        }
        return { name, path: `/${name}` };
      }),
    },
    200,
  ),
);

export default app;
