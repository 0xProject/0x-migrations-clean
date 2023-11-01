# JS Framework

## Setup

1. Clone this repo.
2. `yarn -D`
3. Yarn link the contract packages you need so the scripts can import the artifacts:
    1. `(cd /path/to/0x-protocol/contracts/zero-ex && yarn link) && yarn link '@0x/contracts-zero-ex'`
    2. `(cd /path/to/0x-exchange-v3/contracts/multisig && yarn link) && yarn link '@0x/contracts-multisig'`
    3. `(cd /path/to/0x-exchange-v3/contracts/exchange && yarn link) && yarn link '@0x/contracts-exchange'`
4. Go to etherscan and create an API key.
5. Create a deployer account that you can acceess the private key to and fund it on mainnet and ropsten. _This should not be a security-sensitive account_. Don’t SEND transaction with the deployer account before deployment. We need the first nonce to get vanity EP address.
6. At the root of the project, create a `secrets.json` file like:

```json
{
    "senderKey": "0xYOUR_DEPLOYER_PRIVATE_KEY_IN_HEX",
    "etherscanKey": "YOUR_ETHERSCAN_API_KEY",
    "bscscanKey": "YOUR_BSCSCAN_API_KEY",
    "polygonscanKey": "YOUR_POLYGONSCAN_API_KEY",
    "snowtraceKey": "YOUR_SNOWTRACE_API_KEY",
    "ftmscanKey": "YOUR_FTMSCAN_API_KEY"
}
```

## Tips for writing a migration

-   These scripts do not use 0x contract wrappers/providers because 0x tooling is no fun.
-   Use the other migration scripts as examples and try to craft something similar. We don't usually maintain older migrations so try the most recent ones first.

## Tips for deploying migrations

**⇩ Read ALL this before deploying anything! ⇩**

### Running a migration

You need to run the script directly, setting some environment variables at the same time. Ex:

```bash
$ NODE_RPC=$YOUR_NODE_RPC TIP=20 node src/path/to/migration/script.js
```

### Test on ganache fork

If applicable, always ganache fork your migration on mainnet first. EP migration scripts will also submit, confirm, and execute the calldata through the governor then do some rudimentary checks to see if it worked.

```bash
# Simulate deployment from the project root using `FORK_RPC`
$ FORK_RPC=$YOUR_NODE_RPC TIP=1 node src/path/to/migration/script.js
```

Testing on a ganache fork will also give you an approximate total ETH cost so you know how much to shake down jacob for.

### Deploy to Ropsten first (mainnet migrations only)

We want to keep Ropsten in sync with mainnet. This also acts as a smoke test. Most scripts are set up to deploy to ropsten like so:

```bash
NETWORK=ropsten TIP=1 node src/path/to/migration/script.js
```

We don't keep an up-to-date version of the EP on BSC testnet so just YOLO on BSC mainnet. 🤞

### Exchange proxy migrations

EP migration scripts will usually deploy some contracts then spit out governor calldata. The migration is not complete until the governor contract executes the calldata. The governor is at the same address on all networks (`0x618f9c67ce7bf1a50afa1e7e0238422601b0ff6e`). You can use etherscan + metamask/ledger to interact with the governor.

-   On testnets, the governor is a 1-of-N multisig, so one person can complete the migration by themself, and there is no timelock.
-   On mainnet, the governor is a 2-of-N multisig. You will need at least two signers. There is a 48-hour timelock on everything except calls to `rollback()`.

The governor flow is like:

-   Signer A calls `submitTransaction(0, 0, GENERATED_DATA)`.
    -   Snoop the tx logs to get the tx ID (just an increasing integer).
-   (on mainnet) Signer B calls `confirmTransaction(TX_ID)`.
-   After the timelock, anyone can call `executeTransaction(TX_ID)`, which completes the migration.
    -   Check the logs of this transaction. Etherscan will do a crap job decoding EP events because it doesn't understand the architecture, but you should look out for events that resemble `ProxyFunctionUpdated` events and `Migrated` events.
    -   The ganache fork simulation can actually inspect these logs, which is why it's important to ganache fork the migration first.

### Transformer migrations

The `transformerDeployer` contract only allows authorized addresses to interact with it, so you will need to set `senderKey` to the private key of an authorized address. The process is much simpler here as there is no going through the governor at all.

## Common Errors

`Error: Number can only safely store up to 53 bits.` Go to `node_modules/bn.js/lib/bn.js` line 506 and comment out the entire line (`assert(false, 'Number can only safely store up to 53 bits')`)
