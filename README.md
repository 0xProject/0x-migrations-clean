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

# Foundry Framework

This is still under active development, especially while issues in foundry are being worked out.

## Setup

Ensure you have [foundry](https://github.com/foundry-rs/foundry) installed and it is up to date with:

```
# Install
curl -L https://foundry.paradigm.xyz | bash
# Update foundry binaries
foundryup
```

Ensure git submodules have been initialized and pulled

```
git submodule update --init --recursive
```

Set the following environment variables per network:

```
export ETH_RPC_URL=
# Note Etherscan has unique API keys PER NETWORK
export ETHERSCAN_API_KEY=
```

### Using your ledger

Add the following CLI params

```
# Flag that you wish to use Ledger
--ledger
# The derivation path to your address, this can be different and the example is a legacy method, yours may be m/44'/60'/1'/0 or some other combination
--hd-paths "m/44'/60'/0'/1"
# The sender address at the above path, just makes your life easier and the script uses that, without it, it choses a default msg.sender and can have different behaviour
--sender "0xABCD"
# Some networks don't support EIP1559 (optional) or have issues in pricing
--legacy
```

### Simulating a migration

Running without the `--broadcast` will run in simulation only. Nothing will be submitted to the chain.

```
forge script script/exchange-proxy/polygon/migrations/8_metatxn/Deploy.s.sol -f $ETH_RPC_URL -vvvv
```

### Running a migration

Appending the `--broadcast` will record the transactions and then prompt you to sign (if on ledger) or automatically sign (if using private key) and submit.

Ensure `--verify` is present if you wish the contracts to be varified on Etherscan.

```
forge script script/exchange-proxy/polygon/migrations/8_metatxn/Deploy.s.sol -f $ETH_RPC_URL -vvvv --broadcast --verify
```

### Simulating a (submitted) ZeroEx Governor transaction

To simulate a ZeroEx Governor transaction which has already been submitted. I.e Confirm it, warp time forward, then execute.

```
TX_ID=12 forge script script/exchange-proxy/SimulateGovernorExecute.sol -f $ETH_RPC_URL -vvvv
```

This will print the trace of the transaction being executed after being confirmed by multisig signers.

### Simulating a ZeroEx Governor transaction

In the case where the transaction has not yet been submitted, you can simulate the transaction being submitted confirmed, executed and rolledback by multisig signers.

```
CALLDATA="0x0..." forge script script/exchange-proxy/SimulateGovernorMigrate.sol -f $ETH_RPC_URL -vvvv
```

To simulate the rollback, provide both the `CALLDATA` and `ROLLBACK_CALLDATA` variables.

```
CALLDATA="0x.." ROLLBACK_CALLDATA="0x.." forge script script/exchange-proxy/SimulateGovernorMigrate.sol -f $ETH_RPC_URL -vvvv
```

To simulate the rollback of a migration which has already occured on-chain, provide the rollback calldata as `CALLDATA variable.

### Executing a (confirmed) ZeroEx Governor transaction

To execute a ZeroEx Governor transaction which has been confirmed and past the timelock. Note: This will submit to the network (`--broadcast`).

```
TX_ID=12 forge script script/exchange-proxy/GovernorExecute.sol -f $ETH_RPC_URL -vvvv --broadcast
```

This will print the trace of the transaction being executed and then submit the transaction to the chain.

### Fund Recovery

To submit a tx to recover funds accidentally left in the 0x Exchange Proxy address via the Governor, run the following script:

```
TOKENS="0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2,0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" forge script script/exchange-proxy/FundRecovery.sol -f $ETH_RPC_URL -vvvv --sender <GOVERNOR_OWNER_ADDR>
```

Where `0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE` represents any ETH in the contract. The transaction will be submitted to the governor (for later confirmation) and the funds will be sent to the Governor.

### Multisig updates

To make modifications to the the Governor Multisig, make changes to the `UpdateGovernor.sol` file. Then to configure the Governor run the following script:

```
forge script script/exchange-proxy/UpdateGovernor.sol -f $ETH_RPC_URL -vvvv [--broadcast]
```

This script, along with the configuration defined in `UpdateGovernor.sol` can:

-   Add / remove signers
-   Modify the number of required confirmations
-   Modify the timelock

There are different signers for Ethereum vs Sidechains/L2. This script does not currently support Testnets which have additional signers and no time lock.

## Staking

### Staking Epoch Finalization

To finalize Staking pools and push forward the epoch, run the following script:

```
forge script script/exchange-proxy/FinalizeStakingEpoch.sol -f $ETH_RPC_URL -vvvv --broadcast
```

If the epoch has not yet ended (time) then you can simulate what will occur by warping time forward. To do this, prepend `WARP=true`. Note: we use `--skip-simulation` to prevent `foundry` from running the pre-tx submission simulation (where time warp is not possible).

```
WARP=true forge script script/exchange-proxy/FinalizeStakingEpoch.sol -f $ETH_RPC_URL -vvvv --skip-simulation
```

## Utils

### MultiSend

This script will deploy a contract (deterministically for your address) and then send the Native asset out some amount to multiple recipients. The amount is configured in the script itself. It is useful to top up Deployer addresses.

```
RECIPIENTS="0x000000c397124D0375555F435e201F83B636C26C,0xAc3c9f9a125F569a3112d1C60e008fA55e159B92,0x9E4496adE6096b000C856219C27734F4f89A5210" forge script script/utils/MultiSend.sol --tc "MultiSend" -f $ETH_RPC_URL -vvvv --sender 0x24420bC8C760787F3eEF3b809e81f44d31a9c5A2 --verify --broadcast
```

We use [CREATE3](https://github.com/ZeframLou/create3-factory) available on most networks to deploy a basic disperse contract. As long as the bytecode doesn't change this will only deploy a contract once per network. Subsequent uses will then reuse the deployment.
