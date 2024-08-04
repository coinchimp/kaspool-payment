// @ts-ignore
globalThis.WebSocket = require('websocket').w3cwebsocket; // W3C WebSocket module shim
import Database from '../database';
import { sompiToKaspaStringWithSuffix, type IPaymentOutput, createTransactions, PrivateKey, UtxoProcessor, UtxoContext, type RpcClient } from "../../wasm/kaspa/kaspa";
import Monitoring from '../monitoring';
import { DEBUG } from "../index";

export default class trxManager {
  private networkId: string;
  private privateKey: PrivateKey;
  private address: string;
  private processor: UtxoProcessor;
  private context: UtxoContext;
  private db: Database;
  private monitoring: Monitoring;


  constructor(networkId: string, privKey: string, databaseUrl: string, rpc: RpcClient) {
    this.monitoring = new Monitoring();
    this.networkId = networkId;
    if (DEBUG) this.monitoring.debug(`TrxManager: Network ID is: ${this.networkId}`);
    this.db = new Database(databaseUrl);
    this.privateKey = new PrivateKey(privKey);
    this.address = this.privateKey.toAddress(networkId).toString();
    this.processor = new UtxoProcessor({ rpc, networkId });
    this.context = new UtxoContext({ processor: this.processor });
  }

  async init() {
    this.monitoring.log('TrxManager: Manager initialized');
  }

  async transferBalances() {
    const balances = await this.db.getAllBalancesExcludingPool();
    let payments: IPaymentOutput[] = [];

    for (const { address, balance } of balances) {
      if (balance > 0) {
        this.monitoring.log(`TrxManager: Processing balance ${sompiToKaspaStringWithSuffix(balance, this.networkId!)} for address ${address}`);
        
        payments.push({
          address: address,
          amount: balance
        });

        await this.db.resetBalanceByAddress(address);
        this.monitoring.log(`TrxManager: Reset balance for address ${address}`);
      }
    }

    if (payments.length === 0) {
      return this.monitoring.log('TrxManager: No payments found for current transfer cycle.');
    }

    const transactionId = await this.send(payments);
    this.monitoring.log(`TrxManager: Sent payments. Transaction ID: ${transactionId}`);
  }

  async send(outputs: IPaymentOutput[]) {
    console.log(outputs);
    const { transactions, summary } = await createTransactions({
      entries: this.context,
      outputs,
      changeAddress: this.address,
      priorityFee: 0n
    });

    for (const transaction of transactions) {
      await transaction.sign([this.privateKey]);
      await transaction.submit(this.processor.rpc);
      if (DEBUG) this.monitoring.debug(`TrxManager: Payment with ransaction ID: ${transaction.id} submitted`);
      await new Promise(resolve => setTimeout(resolve, 5000)); // 5-second delay
    }

    return summary.finalTransactionId;
  }
}