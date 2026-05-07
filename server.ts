import express from "express";
import { createServer as createViteServer } from "vite";
import { WebSocketServer, WebSocket } from "ws";
import path from "path";
import http from "http";
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Constants
const PAIRS = [
  { id: 'R_10', name: 'Volatility 10' },
  { id: '1HZ10V', name: 'Volatility 10 (1s)' },
  { id: 'R_25', name: 'Volatility 25' },
  { id: '1HZ25V', name: 'Volatility 25 (1s)' },
  { id: 'R_50', name: 'Volatility 50' },
  { id: '1HZ50V', name: 'Volatility 50 (1s)' },
  { id: 'R_75', name: 'Volatility 75' },
  { id: '1HZ75V', name: 'Volatility 75 (1s)' },
  { id: 'R_100', name: 'Volatility 100' },
  { id: '1HZ100V', name: 'Volatility 100 (1s)' },
];

const WS_URL = "wss://ws.binaryws.com/websockets/v3?app_id=1089";

// State
let backgroundSignals: any[] = [];
let scanStatus = "Scanner Active - Background Scanning Started";

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws-signals' });
  const PORT = 3000;

  // Broadcast function
  const broadcast = (data: any) => {
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(data));
      }
    });
  };

  // --- BACKGROUND SCANNER ENGINE ---
  let derivWs = new WebSocket(WS_URL);
  let pairIndex = 0;

  const runScannerStep = () => {
    if (derivWs.readyState === WebSocket.OPEN) {
      const pair = PAIRS[pairIndex];
      derivWs.send(JSON.stringify({
        ticks_history: pair.id,
        adjust_start_time: 1,
        count: 100,
        end: 'latest',
        granularity: 120, // 2M
        style: 'candles'
      }));
      pairIndex = (pairIndex + 1) % PAIRS.length;
    } else if (derivWs.readyState === WebSocket.CLOSED) {
      derivWs = new WebSocket(WS_URL);
      setupWs();
    }
  };

  const setupWs = () => {
    derivWs.on('message', (msg: any) => {
      const data = JSON.parse(msg.toString());
      if (data.candles) {
        const pairId = data.echo_req.ticks_history;
        const pair = PAIRS.find(p => p.id === pairId);
        if (!pair) return;

        const candles = data.candles;
        const currentPrice = candles[candles.length - 1].close;

        // --- STRATEGY: RENKO DOUBLE-BRICK ---
        // Calculate ATR(14)
        const trueRanges = [];
        for (let i = 1; i < candles.length; i++) {
          const h = candles[i].high;
          const l = candles[i].low;
          const pc = candles[i-1].close;
          trueRanges.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
        }
        const atr = trueRanges.slice(-14).reduce((a, b) => a + b, 0) / 14;
        const brickSize = atr > 0 ? atr : currentPrice * 0.0003;

        // Build Bricks
        const bricks: any[] = [];
        let pClose = candles[0].close;
        candles.forEach((c: any) => {
          const diff = c.close - pClose;
          if (Math.abs(diff) >= brickSize) {
            const num = Math.floor(Math.abs(diff) / brickSize);
            for (let j = 0; j < num; j++) {
              bricks.push({
                type: diff > 0 ? 'up' : 'down',
                open: pClose,
                close: pClose + (diff > 0 ? brickSize : -brickSize)
              });
              pClose = bricks[bricks.length - 1].close;
            }
          }
        });

        // Detect Signal
        if (bricks.length > 20) {
          const last = bricks[bricks.length - 1];
          const prev = bricks[bricks.length - 2];
          const pPrev = bricks[bricks.length - 3];

          // Momentum / Staircase Check
          const context = bricks.slice(-10, -2);
          const upCount = context.filter(b => b.type === 'up').length;
          const downCount = context.filter(b => b.type === 'down').length;

          let signal: any = null;
          if (last.type === 'up' && prev.type === 'up' && pPrev.type === 'down' && downCount >= 5) {
            signal = { type: 'RISE', pair: pair.name, pairId: pair.id };
          } else if (last.type === 'down' && prev.type === 'down' && pPrev.type === 'up' && upCount >= 5) {
            signal = { type: 'FALL', pair: pair.name, pairId: pair.id };
          }

          if (signal) {
            const epoch = Math.floor(Date.now() / 1000);
            const tradeSignal = {
              ...signal,
              id: Math.random().toString(36).substr(2, 9),
              entryTime: epoch + 60,
              expirationTime: epoch + 360,
              status: 'pending'
            };
            
            // Avoid duplicate recently sent signals
            const exists = backgroundSignals.find(s => s.pairId === pair.id && epoch - s.entryTime < 300);
            if (!exists) {
              backgroundSignals.push(tradeSignal);
              if (backgroundSignals.length > 20) backgroundSignals.shift();
              broadcast({ type: 'NEW_SIGNAL', signal: tradeSignal });
            }
          }
        }
      }
    });
  };

  setupWs();
  setInterval(runScannerStep, 5000);

  // Vite integration
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
