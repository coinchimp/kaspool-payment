import { Client } from 'pg';

type Miner = {
  balance: bigint;
};

type MinerBalanceRow = {
  miner_id: string;
  wallet: string;
  balance: string;
};

export default class Database {
  client: Client;

  constructor(connectionString: string) {
    this.client = new Client({
      connectionString: connectionString,
    });
    this.client.connect();
  }

  async getAllBalancesExcludingPool() {
    const res = await this.client.query('SELECT miner_id, wallet, balance FROM miners_balance WHERE miner_id != $1', ['pool']);
    return res.rows.map((row: MinerBalanceRow) => ({
      minerId: row.miner_id,
      address: row.wallet,
      balance: BigInt(row.balance)
    }));
  }

  async resetBalanceByAddress(wallet: string) {
    await this.client.query('UPDATE miners_balance SET balance = $1 WHERE wallet = $2', [0n, wallet]);
  }
}
