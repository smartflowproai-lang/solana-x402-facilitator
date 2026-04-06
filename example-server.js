const express = require("express");
const { createMiddleware } = require("./middleware");

const app = express();

// x402 Solana payment middleware
app.use(createMiddleware({
  rpcUrl: process.env.HELIUS_RPC_URL || "https://mainnet.helius-rpc.com/?api-key=YOUR_KEY",
  payTo: process.env.SOLANA_PAY_TO || "YOUR_SOLANA_ADDRESS",
  routes: {
    "GET /api/decision": {
      price: "$0.01",
      description: "AI-powered token decision: BUY / WATCH / AVOID"
    }
  }
}));

// Free endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", chain: "solana", x402: true });
});

// Paid endpoint
app.get("/api/decision", (req, res) => {
  res.json({
    decision: "WATCH",
    score: 62,
    reasoning: "Moderate signals, needs more data",
    paid_via: req.x402 ? `solana:${req.x402.signature}` : "free-tier"
  });
});

const PORT = process.env.PORT || 3402;
app.listen(PORT, () => {
  console.log(`x402 Solana server running on :${PORT}`);
  console.log("Paid routes: GET /api/decision ($0.01 USDC via Solana)");
});
