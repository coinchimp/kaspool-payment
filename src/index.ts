/**
 * Made by coinchimp (Twitter: https://x.com/coinchimpx)
 * 
 * This script initializes the kaspool Payment App, sets up the necessary environment variables,
 * and schedules a balance transfer task based on configuration. It also provides progress logging 
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

// Configuration parameters
const paymentInterval = config.paymentInterval || 2; // Default to 2 hours if not set
if (paymentInterval < 1 || paymentInterval > 24) {
  throw new Error('paymentInterval must be between 1 and 24 hours.');
}
if (DEBUG) monitoring.debug(`Main: Payment interval set to ${paymentInterval} hours`);

// Type annotations
let rpc: RpcClient | null = null;
let transactionManager: trxManager | null = null;

const startRpcConnection = async () => {
  if (DEBUG) monitoring.debug(`Main: Setting up RPC client`);
  rpc = new RpcClient({
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
};

const stopRpcConnection = async () => {
  if (rpc) {
    await rpc.disconnect();
    if (DEBUG) monitoring.debug(`Main: RPC connection closed`);
  }
};

// Transaction Manager setup
const setupTransactionManager = () => {
  if (DEBUG) monitoring.debug(`Main: Starting transaction manager`);
  transactionManager = new trxManager(config.network, treasuryPrivateKey, databaseUrl, rpc!);
};

// Schedule balance transfer
cron.schedule(`0 0 */${paymentInterval} * * *`, async () => {
  try {
    await startRpcConnection();
    setupTransactionManager();
    monitoring.log('Main: Running scheduled balance transfer');
    await transactionManager!.transferBalances();
    setTimeout(async () => {
      await stopRpcConnection();
    }, 10 * 60 * 1000); // Disconnect 10 minutes after transaction
  } catch (transactionError) {
    monitoring.error(`Main: Transaction manager error: ${transactionError}`);
  }
});

monitoring.log(`Main: Scheduled balance transfer every ${paymentInterval} hours`);

// RPC connection 10 minutes before balance transfer
cron.schedule(`50 59 */${paymentInterval-1} * * *`, async () => {
  await startRpcConnection();
  if (DEBUG) monitoring.debug('Main: RPC connection started 10 minutes before balance transfer');
});

// Progress indicator logging every 10 minutes
setInterval(() => {
  const now = new Date();
  const minutes = now.getMinutes();
  const remainingMinutes = paymentInterval * 60 - (minutes % (paymentInterval * 60));
  const remainingTime = remainingMinutes === paymentInterval * 60 ? 0 : remainingMinutes;
  if (DEBUG) monitoring.debug(`Main: ${remainingTime} minutes until the next balance transfer`);
}, 10 * 60 * 1000); // 10 minutes in milliseconds
