/**
 * Test client for Solana x402 facilitator
 * 
 * Usage: 
 *   node test-client.js              # Test 402 response (no payment)
 *   node test-client.js --pay        # Test with payment (requires funded wallet)
 */
const { Connection, Keypair, PublicKey, Transaction, SystemProgram } = require("@solana/web3.js");
const { getAssociatedTokenAddress, createTransferInstruction } = require("@solana/spl-token");
const { USDC_MINT, USDC_DECIMALS } = require("./verify");

const SERVER = process.env.SERVER_URL || "http://localhost:3402";
const RPC = process.env.HELIUS_RPC_URL || "https://mainnet.helius-rpc.com/?api-key=YOUR_KEY";

async function test402Response() {
  console.log("--- Testing 402 response (no payment) ---");
  const res = await fetch(`${SERVER}/api/decision?token=test`);
  console.log(`Status: ${res.status}`);
  
  if (res.status === 402) {
    const body = await res.json();
    console.log("Payment required:");
    console.log(JSON.stringify(body, null, 2));
    
    const paymentHeader = res.headers.get("payment-required");
    if (paymentHeader) {
      const decoded = JSON.parse(Buffer.from(paymentHeader, "base64").toString());
      console.log("\nDecoded PAYMENT-REQUIRED header:");
      console.log(JSON.stringify(decoded, null, 2));
    }
  }
  return res.status;
}

async function testWithPayment() {
  console.log("\n--- Testing with payment ---");
  
  if (!process.env.SOLANA_PRIVATE_KEY) {
    console.log("Set SOLANA_PRIVATE_KEY env var to test with real payment");
    return;
  }

  const connection = new Connection(RPC, "confirmed");
  const payer = Keypair.fromSecretKey(
    Buffer.from(JSON.parse(process.env.SOLANA_PRIVATE_KEY))
  );

  // First get 402 to know requirements
  const res402 = await fetch(`${SERVER}/api/decision?token=test`);
  const requirements = await res402.json();
  const accepts = requirements.accepts[0];
  
  const payTo = new PublicKey(accepts.payTo);
  const amount = Math.round(parseFloat(accepts.amount) * (10 ** USDC_DECIMALS));

  // Build SPL USDC transfer
  const sourceATA = await getAssociatedTokenAddress(USDC_MINT, payer.publicKey);
  const destATA = await getAssociatedTokenAddress(USDC_MINT, payTo);

  const tx = new Transaction().add(
    createTransferInstruction(sourceATA, destATA, payer.publicKey, amount)
  );
  
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  tx.feePayer = payer.publicKey;
  tx.sign(payer);

  // Encode as x402 payment header
  const paymentPayload = {
    transaction: tx.serialize().toString("base64"),
    payer: payer.publicKey.toBase58()
  };
  const paymentHeader = Buffer.from(JSON.stringify(paymentPayload)).toString("base64");

  // Send with payment
  const paidRes = await fetch(`${SERVER}/api/decision?token=test`, {
    headers: { "x-payment": paymentHeader }
  });
  
  console.log(`Status: ${paidRes.status}`);
  const body = await paidRes.json();
  console.log("Response:", JSON.stringify(body, null, 2));
}

(async () => {
  const status = await test402Response();
  if (process.argv.includes("--pay")) {
    await testWithPayment();
  }
})();
