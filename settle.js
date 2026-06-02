const { Connection, sendAndConfirmTransaction } = require("@solana/web3.js");

const settledSignatures = new Map();
const REPLAY_CACHE_TTL_MS = 60 * 60 * 1000;

function getTransactionSignature(tx) {
  const signer = tx.signatures.find(s => s.signature);
  return signer?.signature ? Buffer.from(signer.signature).toString("base64") : null;
}

function pruneReplayCache(now = Date.now()) {
  for (const [signature, timestamp] of settledSignatures.entries()) {
    if (now - timestamp > REPLAY_CACHE_TTL_MS) {
      settledSignatures.delete(signature);
    }
  }
}

/**
 * Settle a verified x402 payment on Solana
 * @param {Transaction} tx - verified transaction
 * @param {Connection} connection - Solana RPC connection
 * @param {object} opts - { commitment: "confirmed" | "finalized" }
 * @returns {object} { success, signature, slot, reason }
 */
async function settlePayment(tx, connection, opts = {}) {
  const commitment = opts.commitment || "confirmed";
  const replayKey = getTransactionSignature(tx);
  const now = Date.now();
  pruneReplayCache(now);

  if (!replayKey) {
    return {
      success: false,
      signature: null,
      reason: "Transaction is missing a signature"
    };
  }

  if (settledSignatures.has(replayKey)) {
    return {
      success: false,
      signature: null,
      reason: "Payment signature has already been used"
    };
  }

  settledSignatures.set(replayKey, now);
  
  try {
    // Transaction is already signed by the payer
    // We just need to submit it to the network
    const rawTx = tx.serialize();
    
    const signature = await connection.sendRawTransaction(rawTx, {
      skipPreflight: false,
      preflightCommitment: commitment
    });

    console.log(`[x402-sol] Transaction submitted: ${signature}`);

    // Wait for confirmation
    const confirmation = await connection.confirmTransaction(signature, commitment);
    
    if (confirmation.value.err) {
      return {
        success: false,
        signature,
        reason: `Transaction failed: ${JSON.stringify(confirmation.value.err)}`
      };
    }

    // Get slot for receipt
    const txInfo = await connection.getTransaction(signature, { commitment });
    
    return {
      success: true,
      signature,
      slot: txInfo?.slot || null,
      blockTime: txInfo?.blockTime || null,
      fee: txInfo?.meta?.fee || null,
      reason: null
    };

  } catch (err) {
    return {
      success: false,
      signature: null,
      reason: `Settlement error: ${err.message}`
    };
  }
}

module.exports = { settlePayment };
