/**
 * Made by coinchimp (Twitter: https://x.com/coinchimpx)
 * 
 * This script initializes the kaspool Payment App, sets up the necessary environment variables,
 * and schedules a balance transfer task to run every 2 hours. It also provides progress logging 
 * every 10 minutes.
 */

import { RpcClient, Encoding, Resolver } from "../wasm/kaspa";
import config from "../config/config.json";
import dotenv from 'dotenv';
import Monitoring from './monitoring';
import trxManager from './trxs';
import cron from 'node-cron';

// Debug mode setting
export let DEBUG = 0;
if (process.env.DEBUG === "1") {
  DEBUG = 1;
}

const monitoring = new Monitoring();
monitoring.log(`Main: Starting kaspool Payment App`);

dotenv.config();

// Environment variable checks
const treasuryPrivateKey = process.env.TREASURY_PRIVATE_KEY;
if (!treasuryPrivateKey) {
  throw new Error('Environment variable TREASURY_PRIVATE_KEY is not set.');
}
if (DEBUG) monitoring.debug(`Main: Obtained treasury private key`);

if (!config.network) {
  throw new Error('No network has been set in config.json');
}
if (DEBUG) monitoring.debug(`Main: Network Id: ${config.network}`);

const kaspoolPshGw = process.env.PUSHGATEWAY;
if (!kaspoolPshGw) {
  throw new Error('Environment variable PUSHGATEWAY is not set.');
}
if (DEBUG) monitoring.debug(`Main: PushGateway URL obtained`);

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('Environment variable DATABASE_URL is not set.');
}
if (DEBUG) monitoring.debug(`Main: Database URL obtained`);

// RPC client setup
if (DEBUG) monitoring.debug(`Main: Setting up RPC client`);
const rpc = new RpcClient({
  resolver: new Resolver(),
  encoding: Encoding.Borsh,
  networkId: config.network,
});

if (DEBUG) monitoring.debug(`Main: Starting RPC connection`);
await rpc.connect();
const serverInfo = await rpc.getServerInfo();
if (!serverInfo.isSynced || !serverInfo.hasUtxoIndex) {
  throw Error('Provided node is either not synchronized or lacks the UTXO index.');
}
if (DEBUG) monitoring.debug(`Main: RPC connection established`);

// Transaction Manager setup
if (DEBUG) monitoring.debug(`Main: Starting transaction manager`);
const transactionManager = new trxManager(config.network, treasuryPrivateKey, databaseUrl, rpc);

// Schedule balance transfer every 2 hours
cron.schedule('0 */2 * * *', async () => {
  try {
    monitoring.log('Main: Running scheduled balance transfer');
    await transactionManager.transferBalances();
  } catch (transactionError) {
    monitoring.error(`Main: Transaction manager error: ${transactionError}`);
  }
});

monitoring.log('Main: Scheduled balance transfer every 2 hours');

// Progress indicator logging every 10 minutes
setInterval(() => {
  const now = new Date();
  const minutes = now.getMinutes();
  const remainingMinutes = 120 - (minutes % 120);
  const remainingTime = remainingMinutes === 120 ? 0 : remainingMinutes;
  if (DEBUG) monitoring.debug(`Main: ${remainingTime} minutes until the next balance transfer`);
}, 10 * 60 * 1000); // 10 minutes in milliseconds
