import { getRequestListener } from "@hono/node-server";
import app from "../dist/app.js";

export const config = {
  runtime: "nodejs",
};

export default getRequestListener(app.fetch);

