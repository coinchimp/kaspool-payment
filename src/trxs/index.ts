import { EventEmitter } from 'events'
import Database from '../database';
import { sompiToKaspaStringWithSuffix, type IPaymentOutput, createTransactions, PrivateKey, UtxoProcessor, UtxoContext, type RpcClient } from "../../wasm/kaspa";
import Monitoring from '../monitoring';
import { DEBUG } from "../index";

export default class trxManager extends EventEmitter {
  private networkId: string;
  private privateKey: PrivateKey;
  private address: string;
  private processor: UtxoProcessor;
  private context: UtxoContext;
  private db: Database;
  private monitoring: Monitoring;


  constructor(networkId: string, privKey: string, databaseUrl: string, rpc: RpcClient) {
    super()
    this.monitoring = new Monitoring();
    this.networkId = networkId;
    if (DEBUG) this.monitoring.debug(`TrxManager: Network ID is: ${this.networkId}`);
    this.db = new Database(databaseUrl);
    this.privateKey = new PrivateKey(privKey);
    this.address = this.privateKey.toAddress(networkId).toString();
    if (DEBUG) this.monitoring.debug(`TrxManager: Pool Address: ${this.address}`);
    this.processor = new UtxoProcessor({ rpc, networkId });
    this.context = new UtxoContext({ processor: this.processor });
    this.registerProcessor()
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
      }
    }

    if (payments.length === 0) {
      return this.monitoring.log('TrxManager: No payments found for current transfer cycle.');
    }

    const transactionId = await this.send(payments);
    this.monitoring.log(`TrxManager: Sent payments. Transaction ID: ${transactionId}`);

    if (transactionId) {
      for (const { address, balance } of balances) {
      if (balance > 0) {
        await this.db.resetBalanceByAddress(address);
        this.monitoring.log(`TrxManager: Reset balance for address ${address}`);
      
        }
      }
    }

  }

  async send(outputs: IPaymentOutput[]) {
    console.log(outputs);
    if (DEBUG) this.monitoring.debug(`TrxManager: Context to be used: ${this.context}`);
    
    const { transactions, summary } = await createTransactions({
      entries: this.context,
      outputs,
      changeAddress: this.address,
      priorityFee: 0n
    });
  
    // Handle the first transaction immediately
    if (transactions.length > 0) {
      const firstTransaction = transactions[0];
      if (DEBUG) this.monitoring.debug(`TrxManager: Payment with transaction ID: ${firstTransaction.id} to be signed and submitted`);
      
      firstTransaction.sign([this.privateKey]);
      firstTransaction.submit(this.processor.rpc);
      
      if (DEBUG) this.monitoring.debug(`TrxManager: Payment with transaction ID: ${firstTransaction.id} submitted`);
    }
  
    // Handle the remaining transactions, waiting for the `time-to-submit` event
    for (let i = 1; i < transactions.length; i++) {
      const transaction = transactions[i];
      if (DEBUG) this.monitoring.debug(`TrxManager: Payment with transaction ID: ${transaction.id} to be signed`);
  
      transaction.sign([this.privateKey]);
  
      await new Promise<void>((resolve) => {
        this.once('time-to-submit', () => {
          if (DEBUG) this.monitoring.debug(`TrxManager: Payment with transaction ID: ${transaction.id} to be submitted`);
          transaction.submit(this.processor.rpc);
          if (DEBUG) this.monitoring.debug(`TrxManager: Payment with transaction ID: ${transaction.id} submitted`);
          resolve();
        });
      });
    }
  
    if (DEBUG) this.monitoring.debug(`TrxManager: summary.finalTransactionId: ${summary.finalTransactionId}`);
    return summary.finalTransactionId;
  }
  


  private registerProcessor () {
    this.processor.addEventListener("utxo-proc-start", async () => {
      if (DEBUG) this.monitoring.debug(`TrxManager: registerProcessor - this.context.clear()`);
      await this.context.clear()
      if (DEBUG) this.monitoring.debug(`TrxManager: registerProcessor - tracking pool address`);
      await this.context.trackAddresses([ this.address ])
    })

    this.processor.addEventListener('maturity', () => {
      //if (DEBUG) this.monitoring.debug(`TrxManager: maturity event`)
      this.emit('time-to-submit') 
    })

    this.processor.start()
  }  

}
