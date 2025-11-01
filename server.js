// server.js  —— Zero-dep MC status probe
import http from "http";
import net from "net";
import { TextEncoder, TextDecoder } from "util";

const HOST = process.env.TARGET_HOST || "110.42.96.8";
const PORT = Number(process.env.TARGET_PORT || "25565");
const HTTP_PORT = Number(process.env.PORT || process.env.PORT0 || 8787);

// --------- VarInt helpers ---------
function writeVarInt(num) {
  const out = [];
  let n = (num >>> 0);
  do {
    let temp = n & 0b01111111;
    n >>>= 7;
    if (n !== 0) temp |= 0b10000000;
    out.push(temp);
  } while (n !== 0);
  return Buffer.from(out);
}
function readVarInt(buf, offset = 0) {
  let num = 0, shift = 0, pos = offset;
  while (true) {
    if (pos >= buf.length) return { value: null, bytes: 0 };
    const b = buf[pos++];
    num |= (b & 0x7f) << shift;
    if ((b & 0x80) !== 0x80) break;
    shift += 7;
    if (shift > 35) return { value: null, bytes: 0 };
  }
  return { value: num, bytes: pos - offset };
}
function strBuf(s) {
  const enc = new TextEncoder();
  const b = enc.encode(s);
  return Buffer.concat([writeVarInt(b.length), Buffer.from(b)]);
}

// --------- MC status over TCP (no deps) ---------
async function mcStatus(host, port, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let timer = setTimeout(() => {
      socket.destroy(new Error("timeout"));
    }, timeoutMs);

    socket.once("error", (e) => {
      clearTimeout(timer);
      resolve({ online: false, error: String(e.message || e) });
    });

    socket.connect(port, host, () => {
      // 1) Handshake packet
      // packet id 0x00, protocol version (767 ~ 1.21.1，可随意，只作握手用), server addr, server port, next state 1 (status)
      const protocolVersion = 767;
      const packetId = writeVarInt(0x00);
      const pv = writeVarInt(protocolVersion);
      const addr = strBuf(host);
      const pbuf = Buffer.alloc(2); pbuf.writeUInt16BE(port, 0);
      const nextState = writeVarInt(1);
      const handshakePayload = Buffer.concat([packetId, pv, addr, pbuf, nextState]);
      const handshake = Buffer.concat([writeVarInt(handshakePayload.length), handshakePayload]);

      // 2) Request packet (id 0x00)
      const requestPayload = writeVarInt(0x00);
      const request = Buffer.concat([writeVarInt(requestPayload.length), requestPayload]);

      socket.write(handshake);
      socket.write(request);
    });

    let chunks = [];
    socket.on("data", (d) => chunks.push(d));
    socket.on("close", () => {
      clearTimeout(timer);
      const buf = Buffer.concat(chunks);
      // Response: length VarInt | packetId VarInt (=0) | jsonLen VarInt | json
      let off = 0;
      const len1 = readVarInt(buf, off); if (!len1.bytes) return resolve({ online: true });
      off += len1.bytes;
      const pid = readVarInt(buf, off); if (!pid.bytes) return resolve({ online: true });
      off += pid.bytes;
      const jl = readVarInt(buf, off); if (!jl.bytes) return resolve({ online: true });
      off += jl.bytes;
      const jsonBytes = buf.slice(off, off + jl.value);
      try {
        const json = new TextDecoder().decode(jsonBytes);
        const data = JSON.parse(json);
        const version = data?.version?.name || "未知";
        const online = data?.players?.online ?? 0;
        const max = data?.players?.max ?? "?";
        resolve({ online: true, version, players: { online, max } });
      } catch {
        resolve({ online: true });
      }
    });
  });
}

// --------- tiny HTTP server with CORS ---------
const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");

  if (req.url === "/mcstatus") {
    const st = await mcStatus(HOST, PORT, 3000);
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify(st));
  } else {
    res.statusCode = 404;
    res.end("Not Found");
  }
});

server.listen(HTTP_PORT, () => {
  console.log(`probe on ${HTTP_PORT} → target ${HOST}:${PORT}`);
});
