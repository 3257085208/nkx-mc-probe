import express from "express";
import { status } from "minecraft-server-util";

const HOST = process.env.TARGET_HOST || "110.42.96.8";
const PORT = Number(process.env.TARGET_PORT || "25565");

const app = express();
app.use((_,res,next)=>{res.setHeader("Access-Control-Allow-Origin","*");res.setHeader("Access-Control-Allow-Headers","*");next();});

app.get("/mcstatus", async (_req, res) => {
  try {
    const s = await status(HOST, PORT, { timeout: 3000 });
    res.json({
      online: true,
      version: s?.version?.name || "未知",
      players: { online: s?.players?.online || 0, max: s?.players?.max || "?" }
    });
  } catch (e) {
    res.json({ online: false, error: String(e?.message || e) });
  }
});

const listen = Number(process.env.PORT || process.env.PORT0 || 8787);
app.listen(listen, () => console.log("probe on " + listen));
