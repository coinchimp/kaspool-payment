import config from "../config.json";
import dotenv from 'dotenv';
import Monitoring from './monitoring';
import trxManager from './trxs';
import { RpcClient, Encoding, Resolver } from "../wasm/kaspa";
import cron from 'node-cron';

export let DEBUG = 0;
if (process.env.DEBUG === "1") {
  DEBUG = 1;
}
const monitoring = new Monitoring();
monitoring.log(`Main: Starting kaspool Payment App`);

dotenv.config();

const treasuryPrivateKey = process.env.TREASURY_PRIVATE_KEY;
if (!treasuryPrivateKey) {
  throw new Error('Environment variable TREASURY_PRIVATE_KEY is not set.');
}
if (DEBUG) monitoring.debug(`Main: Getting private key`);

if (!config.networkId) {
  throw new Error('No NetworkId has been set in config.json');
}

if (!config.node_cluster) {
  throw new Error('No node_cluster has been set in config.json');
}

if (DEBUG) monitoring.debug(`Main: Getting Network Id: ${config.networkId}`);

const kaspoolPshGw = process.env.PUSHGATEWAY;
if (!kaspoolPshGw) {
  throw new Error('Environment variable PUSHGATEWAY is not set.');
}
if (DEBUG) monitoring.debug(`Main: Getting pushGateway`);

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('Environment variable DATABASE_URL is not set.');
}
if (DEBUG) monitoring.debug(`Main: Getting Database URL`);

if (DEBUG) monitoring.debug(`Main: Entering schedule to run every 30 minutes`);
  // Schedule the transferBalances method to run every 30 minutes
// Schedule the transferBalances method to run every 30 minutes
//cron.schedule('*/30 * * * *', async () => {

if (DEBUG) monitoring.debug(`Main: Setting up rpc client`);
const rpc = new RpcClient({
  resolver: new Resolver({
    urls: config.node_cluster
  }),
  encoding: Encoding.Borsh,
  networkId: config.networkId,
});
if (DEBUG) monitoring.debug(`Main: Starting rpc connection`);
await rpc.connect();
const serverInfo = await rpc.getServerInfo();
if (!serverInfo.isSynced || !serverInfo.hasUtxoIndex) throw Error('Provided node is either not synchronized or lacks the UTXO index.');
if (DEBUG) monitoring.debug(`Main: RPC connection established`);    
if (DEBUG) monitoring.debug(`Main: Starting transactionManager`);
const transactionManager = new trxManager(config.networkId, treasuryPrivateKey, databaseUrl, rpc);

try {
  await transactionManager.init();
  monitoring.log('Main: Running scheduled balance transfer');
  await transactionManager.transferBalances();
} catch (transactionError) {
  monitoring.error(`Main: Transaction manager error: ${transactionError}`);
}

if (DEBUG) monitoring.debug(`Main: Starting rpc disconnection`);
await rpc.disconnect();

//});
monitoring.log('Main: Scheduled balance transfer every 30 minutes');
/*
// Progress indicator logging every 5 minutes
setInterval(() => {
  const now = new Date();
  const minutes = now.getMinutes();
  const remainingMinutes = 30 - (minutes % 30);
  const remainingTime = remainingMinutes === 30 ? 0 : remainingMinutes;
  if (DEBUG) monitoring.debug(`Main: ${remainingTime} minutes until the next balance transfer`);
}, 5 * 60 * 1000); // 5 minutes in milliseconds*/