import fs from "fs";
import path from "path";

export default async function handler(req, res) {
  try {
    const filePath = path.join(
      process.cwd(),
      "public",
      "data",
      "justetf-results.json"
    );

    const raw = fs.readFileSync(filePath, "utf8");
    const json = JSON.parse(raw);

    res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=3600");

    return res.status(200).json(json);
  } catch (error) {
    return res.status(500).json({
      error: error.message || "Failed to read performance data"
    });
  }
}
