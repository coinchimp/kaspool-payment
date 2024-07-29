// @ts-ignore
globalThis.WebSocket = require('websocket').w3cwebsocket; // W3C WebSocket module shim
import path from 'path';
import fs from 'fs';
import Database from '../database';
import { AccountKind , Wallet, kaspaToSompi, sompiToKaspaString, Resolver } from "../../wasm/kaspa/kaspa";
import Monitoring from '../monitoring';

export default class WalletManager {
  private networkId: string;
  private wallet: Wallet;
  private db: Database;
  private monitoring: Monitoring;
  private walletSecret: string;

  constructor(networkId: string, walletSecret: string, databaseUrl: string) {
    this.networkId = networkId;
    this.walletSecret = walletSecret;
    this.monitoring = new Monitoring();
    this.db = new Database(databaseUrl);
    this.wallet = new Wallet({ resident: false, networkId: this.networkId, resolver: new Resolver() });
  }

  async init() {
    await this.wallet.walletOpen({
      walletSecret: this.walletSecret,
      accountDescriptors: false
    });
    await this.wallet.accountsEnsureDefault({
      walletSecret: this.walletSecret,
      type: new AccountKind("bip32")
    });
    await this.wallet.connect();
    await this.wallet.start();
    this.monitoring.log('WalletManager: Wallet initialized');
  }

  async transferBalances() {
    const balances = await this.db.getAllBalancesExcludingPool();

    for (const { address, balance } of balances) {
      this.monitoring.log(`WalletManager: Processing balance for address ${address}`);

      let accounts = await this.wallet.accountsEnumerate({});
      let firstAccount = accounts.accountDescriptors[0];

      await this.wallet.accountsActivate({
        accountIds: [firstAccount.accountId]
      });

      const sendResult = await this.wallet.accountsSend({
        walletSecret: this.walletSecret,
        accountId: firstAccount.accountId,
        priorityFeeSompi: kaspaToSompi("0.001"),
        destination: [{
          address: address,
          amount: balance
        }]
      });

      this.monitoring.log(`WalletManager: Sent ${sompiToKaspaString(balance)} KAS to ${address}. Transaction ID: ${sendResult.transactionIds}`);

      await this.db.resetBalanceByAddress(address);
      this.monitoring.log(`WalletManager: Reset balance for address ${address}`);
    }

    await this.wallet.stop();
    await this.wallet.disconnect();
    this.monitoring.log('WalletManager: Wallet stopped and disconnected');
  }
}
