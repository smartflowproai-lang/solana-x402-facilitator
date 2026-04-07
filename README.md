# solana-x402-facilitator

[![npm](https://img.shields.io/npm/v/solana-x402-facilitator)](https://www.npmjs.com/package/solana-x402-facilitator)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE.md)

**Open source x402 payment facilitator for Solana.**

x402 is the HTTP 402 Payment Required standard for machine-to-machine micropayments (Linux Foundation). Until now, it only worked on EVM chains (Base, Ethereum). This package brings x402 to Solana.

## Why Solana?

| | EVM (Base) | Solana |
|---|---|---|
| Finality | ~2 seconds | ~400ms |
| Transaction fee | ~$0.01 | ~$0.00025 |
| Micropayment viable | $0.01+ | $0.001+ |
| AI agent ecosystem | Growing | Massive |

## Install

```bash
npm install solana-x402-facilitator
```

## Quick Start

```javascript
const express = require("express");
const { createMiddleware } = require("solana-x402-facilitator");

const app = express();

app.use(createMiddleware({
  rpcUrl: "https://mainnet.helius-rpc.com/?api-key=YOUR_KEY",
  payTo: "YOUR_SOLANA_ADDRESS",
  routes: {
    "GET /api/data": { price: "$0.01", description: "Premium data endpoint" }
  }
}));

app.get("/api/data", (req, res) => {
  // req.x402 contains payment info (payer, amount, signature)
  res.json({ data: "premium content", paidBy: req.x402.payer });
});

app.listen(3000);
```

## How It Works

1. Client requests a paid endpoint
2. Server returns HTTP 402 with Solana payment requirements
3. Client builds & signs SPL USDC transfer transaction
4. Client sends request with `x-payment` header
5. Facilitator verifies signature, amount, and destination
6. Facilitator settles transaction on Solana (~400ms)
7. Server returns the response

## API

### `createMiddleware(config)`
Express middleware for x402 payments.

### `verifyPayment(paymentHeader, requirements, connection)`
Low-level payment verification.

### `settlePayment(tx, connection, opts)`
Low-level on-chain settlement.

## SmartFlow Ecosystem

- [n8n-nodes-x402](https://github.com/smartflowproai-lang/n8n-nodes-x402) — accept & send x402 payments in n8n (no code)
- [SmartFlow Signal API](https://smartflowproai.com) — x402-powered trading signals
- [PQS Leaderboard](https://api.smartflowproai.com/pqs/leaderboard) — transparent quality scoring for signal providers

## License
MIT — Built by Tom Smart ([@TomSmart_ai](https://x.com/TomSmart_ai))
