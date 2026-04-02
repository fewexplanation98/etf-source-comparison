import fs from "fs";
import path from "path";

export default function handler(req, res) {
  try {
    const filePath = path.join(process.cwd(), "public", "data", "justetf-results.json");
    const raw = fs.readFileSync(filePath, "utf8");
    const json = JSON.parse(raw);

    return res.status(200).json(json);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
}
