import config from "../config.json";
import dotenv from 'dotenv';
import Monitoring from './monitoring';
import WalletManager from './wallet';
import cron from 'node-cron';

export let DEBUG = 0;
if (process.env.DEBUG === "1") {
  DEBUG = 1;
}
const monitoring = new Monitoring();
monitoring.log(`Main: Starting kaspool Payment App`);

dotenv.config();

const treasurySecretPhrase = process.env.TREASURY_SECRET_PHRASE;
if (!treasurySecretPhrase) {
  throw new Error('Environment variable TREASURY_SECRET_PHRASE is not set.');
}

if (!config.networkId) {
  throw new Error('No NetworkId has been set in config.json');
}

const kaspoolPshGw = process.env.PUSHGATEWAY;
if (!kaspoolPshGw) {
  throw new Error('Environment variable PUSHGATEWAY is not set.');
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('Environment variable DATABASE_URL is not set.');
}

(async () => {
  const walletManager = new WalletManager(config.networkId, treasurySecretPhrase, databaseUrl);
  await walletManager.init();

  // Schedule the transferBalances method to run every 30 minutes
  cron.schedule('*/30 * * * *', async () => {
    monitoring.log('Main: Running scheduled balance transfer');
    await walletManager.transferBalances();
  });

  monitoring.log('Main: Scheduled balance transfer every 30 minutes');
})();
