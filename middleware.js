const { Connection } = require("@solana/web3.js");
const { verifyPayment, USDC_MINT, USDC_DECIMALS } = require("./verify");
const { settlePayment } = require("./settle");

/**
 * Create x402 payment middleware for Solana
 * 
 * @param {object} config
 * @param {string} config.rpcUrl - Solana RPC endpoint
 * @param {string} config.payTo - Solana address to receive payments
 * @param {object} config.routes - { "GET /path": { price: "$0.01", description: "..." } }
 * @param {string} [config.commitment] - "confirmed" or "finalized"
 * @returns Express middleware
 * 
 * @example
 * const { createMiddleware } = require("solana-x402-facilitator/middleware");
 * app.use(createMiddleware({
 *   rpcUrl: "https://mainnet.helius-rpc.com/?api-key=YOUR_KEY",
 *   payTo: "YOUR_SOLANA_ADDRESS",
 *   routes: {
 *     "GET /api/decision": { price: "$0.01", description: "Token decision" }
 *   }
 * }));
 */
function createMiddleware(config) {
  const connection = new Connection(config.rpcUrl, config.commitment || "confirmed");
  
  return async (req, res, next) => {
    const routeKey = `${req.method} ${req.path}`;
    const routeConfig = config.routes[routeKey];
    
    // Not a paid route — pass through
    if (!routeConfig) return next();

    const paymentHeader = req.headers["x-payment"] || req.headers["payment"];
    const priceUSD = parseFloat(routeConfig.price.replace("$", ""));
    const amountRaw = Math.round(priceUSD * (10 ** USDC_DECIMALS));

    const requirements = {
      x402Version: 2,
      network: "solana-mainnet",
      scheme: "exact",
      amount: String(priceUSD),
      amountRaw: String(amountRaw),
      asset: USDC_MINT.toBase58(),
      payTo: config.payTo,
      maxTimeoutSeconds: 60
    };

    // No payment header — return 402
    if (!paymentHeader) {
      const paymentRequired = {
        x402Version: 2,
        error: "Payment required",
        resource: {
          url: `${req.protocol}://${req.get("host")}${req.path}`,
          description: routeConfig.description || "",
          mimeType: "application/json"
        },
        accepts: [{
          ...requirements,
          extra: {
            name: "USD Coin (Solana)",
            chain: "solana",
            finality: "~400ms",
            txFee: "~$0.00025"
          }
        }]
      };

      res.setHeader(
        "PAYMENT-REQUIRED",
        Buffer.from(JSON.stringify(paymentRequired)).toString("base64")
      );
      return res.status(402).json(paymentRequired);
    }

    // Verify payment
    console.log("[x402-sol] Payment received, verifying...");
    const verification = await verifyPayment(paymentHeader, requirements, connection);

    if (!verification.valid) {
      console.log(`[x402-sol] Verification failed: ${verification.reason}`);
      return res.status(402).json({
        error: "Payment verification failed",
        reason: verification.reason
      });
    }

    // Settle on-chain
    console.log("[x402-sol] Verified! Settling on-chain...");
    const settlement = await settlePayment(verification.tx, connection, {
      commitment: config.commitment || "confirmed"
    });

    if (!settlement.success) {
      console.log(`[x402-sol] Settlement failed: ${settlement.reason}`);
      return res.status(402).json({
        error: "Payment settlement failed",
        reason: settlement.reason
      });
    }

    console.log(`[x402-sol] Settled! sig=${settlement.signature} slot=${settlement.slot}`);

    // Attach payment info to request for downstream use
    req.x402 = {
      payer: verification.payer,
      amount: verification.amount,
      signature: settlement.signature,
      slot: settlement.slot,
      chain: "solana"
    };

    next();
  };
}

module.exports = { createMiddleware };
