const { Connection, PublicKey, Transaction } = require("@solana/web3.js");
const { getAssociatedTokenAddress } = require("@solana/spl-token");
const nacl = require("tweetnacl");
const bs58 = require("bs58");

// Solana USDC (mainnet)
const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
// USDC decimals on Solana = 6
const USDC_DECIMALS = 6;

/**
 * Verify an x402 payment header for Solana
 * @param {string} paymentHeader - base64 encoded payment payload
 * @param {object} requirements - { amount, payTo, asset }
 * @param {Connection} connection - Solana RPC connection
 * @returns {object} { valid, reason, tx, payer }
 */
async function verifyPayment(paymentHeader, requirements, connection) {
  try {
    // Decode payment header
    const payload = JSON.parse(Buffer.from(paymentHeader, "base64").toString());
    
    if (!payload.transaction || !payload.payer) {
      return { valid: false, reason: "Missing transaction or payer in payment payload" };
    }

    // Deserialize the transaction
    const txBuffer = Buffer.from(payload.transaction, "base64");
    const tx = Transaction.from(txBuffer);

    // Verify signature
    const payerPubkey = new PublicKey(payload.payer);
    const message = tx.serializeMessage();
    const signature = tx.signatures.find(
      s => s.publicKey.equals(payerPubkey)
    );

    if (!signature || !signature.signature) {
      return { valid: false, reason: "Transaction not signed by payer" };
    }

    const signatureValid = nacl.sign.detached.verify(
      message,
      signature.signature,
      payerPubkey.toBytes()
    );

    if (!signatureValid) {
      return { valid: false, reason: "Invalid signature" };
    }

    // Verify transfer instruction
    // SPL Token transfer instruction = program index pointing to Token Program
    const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
    
    const transferIx = tx.instructions.find(
      ix => ix.programId.equals(TOKEN_PROGRAM_ID)
    );

    if (!transferIx) {
      return { valid: false, reason: "No SPL token transfer instruction found" };
    }

    // Verify destination is payTo's USDC ATA
    const payToKey = new PublicKey(requirements.payTo);
    const expectedATA = await getAssociatedTokenAddress(USDC_MINT, payToKey);
    
    // SPL Transfer instruction: accounts[1] = destination
    const destinationKey = transferIx.keys[1].pubkey;
    if (!destinationKey.equals(expectedATA)) {
      return { valid: false, reason: "Transfer destination does not match payTo address" };
    }

    // Verify amount from instruction data
    // SPL Transfer instruction data: [3 (transfer opcode), ...amount (u64 LE)]
    const data = transferIx.data;
    if (data[0] !== 3) {
      return { valid: false, reason: "Not a transfer instruction" };
    }
    
    const amountRaw = data.readBigUInt64LE(1);
    const requiredAmount = BigInt(Math.round(parseFloat(requirements.amount) * (10 ** USDC_DECIMALS)));
    
    if (amountRaw < requiredAmount) {
      return { 
        valid: false, 
        reason: `Insufficient amount: ${amountRaw} < ${requiredAmount} (${USDC_DECIMALS} decimals)` 
      };
    }

    // Verify USDC mint (source account's mint)
    const sourceAccount = transferIx.keys[0].pubkey;
    try {
      const accountInfo = await connection.getParsedAccountInfo(sourceAccount);
      if (accountInfo.value?.data?.parsed?.info?.mint !== USDC_MINT.toBase58()) {
        return { valid: false, reason: "Source token account is not USDC" };
      }
    } catch (e) {
      // If we can't verify mint on-chain, log warning but don't fail
      console.warn("[x402-sol] Could not verify source mint on-chain:", e.message);
    }

    return {
      valid: true,
      tx: tx,
      payer: payload.payer,
      amount: Number(amountRaw) / (10 ** USDC_DECIMALS),
      reason: null
    };

  } catch (err) {
    return { valid: false, reason: `Verification error: ${err.message}` };
  }
}

module.exports = { verifyPayment, USDC_MINT, USDC_DECIMALS };
