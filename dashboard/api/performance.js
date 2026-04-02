import fs from "fs";
import path from "path";

export const maxDuration = 60;

export default {
  async fetch(request) {
    try {
      const filePath = path.join(process.cwd(), "public", "data", "justetf-results.json");
      const raw = fs.readFileSync(filePath, "utf8");
      const json = JSON.parse(raw);

      return new Response(JSON.stringify(json), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "cache-control": "s-maxage=1800, stale-while-revalidate=3600"
        }
      });
    } catch (error) {
      console.error("PERFORMANCE_API_ERROR", error);

      return new Response(
        JSON.stringify({ error: error.message || "Failed to read performance data" }),
        {
          status: 500,
          headers: { "content-type": "application/json" }
        }
      );
    }
  }
};
