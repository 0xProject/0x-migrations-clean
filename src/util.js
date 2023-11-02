/** @format */

'use strict';
require('colors');
const crypto = require('crypto');
const FlexEther = require('flex-ether');
const FlexContract = require('flex-contract');
const process = require('process');
const prompt = require('prompt');
const ethjs = require('ethereumjs-util');
const fetch = require('node-fetch');
const BigNumber = require('bignumber.js');
const { URLSearchParams } = require('url');
const AbiEncoder = require('web3-eth-abi');
const ganache = require('ganache-core');
const cw3p = require('create-web3-provider');
const { promisify } = require('util');
const SECRETS = require('../secrets.json');
const { existsSync } = require('fs');

prompt.get = require('util').promisify(prompt.get);
prompt.message = '';
prompt.start();

const TIP = process.env.TIP !== undefined ? new BigNumber('1e9').times(process.env.TIP).toString(10) : new BigNumber(0);
const GAS_LIMIT = process.env.GAS_LIMIT;
const VERIFY_QUEUE = [];
const NULL_ADDRESS = ethjs.bufferToHex(Buffer.alloc(20));
const RANDOM_ADDRESS = ethjs.bufferToHex(crypto.randomBytes(20));
const SENDER = ethjs.toChecksumAddress(ethjs.bufferToHex(ethjs.privateToAddress(ethjs.toBuffer(SECRETS.senderKey))));
const IS_ON_GANACHE = !!process.env.FORK_RPC;
const MIN_CONFIRMATIONS = IS_ON_GANACHE ? 0 : 1;
const NETWORK_NAMES = {
    1: 'main',
    5: 'goerli',
    10: 'optimistic-ethereum',
    56: 'bsc',
    69: 'optimistic-kovan',
    97: 'bsc-testnet',
    137: 'matic',
    250: 'fantom',
    1101: 'polygon-zkevm',
    1442: 'polygon-zkevm-testnet',
    8453: 'base',
    43114: 'avalanche',
    80001: 'matic-testnet',
    84531: 'base-goerli',
    42220: 'celo',
    42161: 'arbitrum',
    421611: 'arbitrum-rinkeby',
};

const ETHERSCAN_API_URL_FOR_NETWORK = {
    main: 'https://api.etherscan.io/api',
    goerli: 'https://api-goerli.etherscan.io/api',
    bsc: 'https://api.bscscan.com/api',
    'bsc-testnet': 'https://api-testnet.bscscan.com/api',
    matic: 'https://api.polygonscan.com/api',
    'matic-testnet': 'https://api-testnet.polygonscan.com/api',
    fantom: 'https://api.ftmscan.com/api',
    'polygon-zkevm': 'https://api-zkevm.polygonscan.com/api',
    'polygon-zkevm-testnet': 'https://api-testnet-zkevm.polygonscan.com/api',
    avalanche: 'https://api.snowtrace.io/api',
    arbitrum: 'https://api.arbiscan.io/api',
    'arbitrum-rinkeby': 'https://api-testnet.arbiscan.io/api',
    'optimistic-ethereum': 'https://api-optimistic.etherscan.io/api',
    'optimistic-kovan': 'https://kovan-optimistic.etherscan.io',
    celo: 'https://api.celoscan.io/api',
    'base-goerli': 'https://api-goerli.basescan.org/api',
    base: 'https://api.basescan.org/api',
};

async function createProvider() {
    if (!process.env.NODE_RPC && !process.env.FORK_RPC) {
        throw new Error(`NODE_RPC or FORK_RPC env var must be set`);
    }
    const liveProvider = cw3p({
        uri: process.env.FORK_RPC || process.env.NODE_RPC,
        network: process.env.network,
    });
    const liveEth = new FlexEther({ provider: liveProvider });
    const chainId = await liveEth.getChainId();
    if (!process.env.FORK_RPC) {
        return liveProvider;
    }
    const forkProvider = ganache.provider({
        fork: liveProvider,
        _chainId: chainId,
        _chainIdRpc: chainId,
        gasLimit: 12e6,
    });
    return {
        async send(payload) {
            if (['eth_maxPriorityFeePerGas', 'eth_getBlockByNumber'].includes(payload.method)) {
                return promisify(liveProvider.send)(payload);
            }
            return promisify(forkProvider.send)(payload);
        },
    };
}

async function getCommonSendOpts(eth) {
    const network = await getCurrentNetworkName(eth);
    const networkSupports1559 = ['main', 'ropsten'].includes(network);
    return {
        fork: IS_ON_GANACHE ? 'istanbul' : undefined,
        key: SECRETS.senderKey,
        gas: GAS_LIMIT,
        ...(await (async () => {
            if (!networkSupports1559) {
                return {
                    gasPrice: numba.add(await eth.getGasPrice(), TIP),
                };
            }
            let baseFee = await eth.getBaseFee();
            if (baseFee) {
                // 1559 network.
                const priorityFee = await eth.getMaxPriorityFee();
                const minimumGasPrice = numba.add(baseFee, priorityFee);
                let maxFeePerGas = numba.add(priorityFee, numba.int(numba.mul(baseFee, 1.2)));
                if (TIP !== undefined) {
                    if (numba.lt(TIP, minimumGasPrice)) {
                        throw new Error(
                            `TIP is less than minimum combined 1559 gas price (${TIP} < ${minimumGasPrice})`,
                        );
                    }
                    // Any excess goes into the maxFeePerGas
                    maxFeePerGas = TIP;
                }
                if (!IS_ON_GANACHE) {
                    return {
                        maxPriorityFeePerGas: priorityFee,
                        maxFeePerGas,
                    };
                } else {
                    // Ganache only understands istanbul gas pricing.
                    return { gasPrice: minimumGasPrice };
                }
            }
            // Other forks only understand istanbul gas pricing.
            return { gasPrice: await eth.getGasPrice() };
        })()),
    };
}

async function getCurrentNetworkName(eth) {
    const chainId = await eth.getChainId();
    if (!NETWORK_NAMES[chainId]) {
        throw new Error(`Unrecognized network with chain ID: ${chainId}`);
    }
    return NETWORK_NAMES[chainId];
}

async function deployEcosystemContract(eth, name, cargs = [], sendOpts = {}) {
    sendOpts = { ...(await getCommonSendOpts(eth)), ...sendOpts };
    const contract = createEcosystemContract(eth, name);
    console.log(`Deploying ecosystem contract "${name.green}"...`);
    const receipt = await contract
        .new(...cargs)
        .send(sendOpts)
        .confirmed(MIN_CONFIRMATIONS);
    addToVerifyQueue(name, receipt.contractAddress, cargs);
    console.log(
        `Deployed ecosystem contract ${name.green}: ${receipt.contractAddress.bold} (${receipt.gasUsed} gas used)`,
    );
    contract.address = receipt.contractAddress;
    return contract;
}

async function deployTransformer(eth, deployer, transformerName, cargs = [], sendOpts = {}) {
    sendOpts = { ...(await getCommonSendOpts(eth)), ...sendOpts };
    const deployData = await createEcosystemContract(eth, `zero-ex/${transformerName}`)
        .new(...cargs)
        .encode();
    console.log(`Deploying transformer "${transformerName.green}"...`);
    const receipt = await deployer.deploy(deployData).send(sendOpts).confirmed(MIN_CONFIRMATIONS);
    const deployedAddress = receipt.findEvent('Deployed').args.deployedAddress;
    console.log(`Deployed transformer ${transformerName.green}: ${deployedAddress.bold} (${receipt.gasUsed} gas used)`);
    addToVerifyQueue(`zero-ex/${transformerName}`, deployedAddress, cargs);
    return deployedAddress;
}

function createEcosystemContract(eth, name, address) {
    const artifact = getEcosystemArtifact(name);
    return new FlexContract(artifact.compilerOutput.abi, {
        address,
        eth,
        bytecode: artifact.compilerOutput.evm.bytecode.object,
        key: SECRETS.senderKey,
    });
}

function createLocalContract(eth, name, address) {
    const artifact = /^[./]/.test(name) ? require(name) : require(`../artifacts/${name}.output.json`);
    return new FlexContract(artifact.abi || artifact, {
        address,
        eth,
        bytecode: artifact.bytecode,
        key: SECRETS.senderKey,
    });
}

function getEcosystemArtifact(name) {
    const [, pkg, artifact] = /^(.+?)\/(.+)$/.exec(name);
    if (existsSync(`node_modules/@0x/contracts-${pkg}/test/generated-artifacts/${artifact}.json`)) {
        return require(`@0x/contracts-${pkg}/test/generated-artifacts/${artifact}.json`);
    } else if (existsSync(`node_modules/@0x/contracts-${pkg}/lib/generated-artifacts/${artifact}.json`)) {
        return require(`@0x/contracts-${pkg}/lib/generated-artifacts/${artifact}.json`);
    } else {
        throw new Error(`Unable to find ${artifact} for ${pkg}`);
    }
}

function getEcosystemInputArtifact(name) {
    const [, pkg, artifact] = /^(.+?)\/(.+)$/.exec(name);
    return require(`@0x/contracts-${pkg}/test/generated-artifacts/${artifact}.input.json`);
}

async function wait(ms) {
    return new Promise((accept, reject) => {
        setTimeout(() => accept(), ms);
    });
}

function encodeGovernorCalls(calls) {
    return AbiEncoder.encodeParameters(
        ['bytes[]', 'address[]', 'uint256[]'],
        [calls.map(c => c.data), calls.map(c => c.to), calls.map(c => c.value)],
    );
}

function toHexWord(v) {
    v = new BigNumber(v);
    const h = '0x' + v.toString(16);
    return ethjs.bufferToHex(ethjs.setLengthLeft(ethjs.toBuffer(h), 32));
}

async function verifySource(eth, name, address, cargs = []) {
    const network = await getCurrentNetworkName(eth);
    if (!ETHERSCAN_API_URL_FOR_NETWORK[network]) {
        console.log(
            `No Etherscan API url for network, contract code cannot be verified. Ensure you keep the json input for future verification`,
        );
        return;
    }
    const contract = createEcosystemContract(eth, name);
    const compilerInput = getEcosystemInputArtifact(name);
    const artifact = getEcosystemArtifact(name);
    const params = new URLSearchParams();
    const cargData = (await contract.new(...cargs).encode()).slice(contract.bytecode.length);
    let apiKey = SECRETS.etherscanKey;

    if (network.startsWith('bsc')) {
        apiKey = SECRETS.bscscanKey;
    } else if (network.startsWith('matic')) {
        apiKey = SECRETS.polygonscanKey;
    } else if (network.startsWith('fantom')) {
        apiKey = SECRETS.ftmscanKey;
    } else if (network.startsWith('celo')) {
        apiKey = SECRETS.celoscanKey;
    } else if (network.startsWith('optimistic-ethereum')) {
        apiKey = SECRETS.optimismKey;
    } else if (network.startsWith('arbitrum')) {
        apiKey = SECRETS.arbitrumKey;
    } else if (network.startsWith('avalanche')) {
        apiKey = SECRETS.snowtraceKey;
    } else if (network === "base") {
        apiKey = SECRETS.basescanKey;
    } else if (network.startsWith('polygon-zkevm')) {
        apiKey = SECRETS.zkevmpolygonscanKey;
    }
    params.set('apikey', apiKey);
    params.set('module', 'contract');
    params.set('action', 'verifysourcecode');
    params.set('contractaddress', address);
    params.set(
        'sourceCode',
        JSON.stringify({
            ...compilerInput,
            settings: {
                ...compilerInput.settings,
                version: undefined,
            },
        }),
    );
    params.set('codeformat', 'solidity-standard-json-input');
    params.set('contractname', findContractPathSpec(compilerInput.sources, artifact.contractName));
    if (cargData.length) {
        params.set('constructorArguements', cargData);
    }
    params.set('compilerversion', `v${compilerInput.settings.version}`);
    params.set('licenseType', 12);
    console.log(`Verifying source code for ${name.bold} on ${network} at ${address.green.bold}...`);
    let result;
    while (!result) {
        try {
            const r = await fetch(ETHERSCAN_API_URL_FOR_NETWORK[network], {
                method: 'POST',
                body: params,
                timeout: 30000,
            });
            result = await r.json();
        } catch (err) {
            if (
                !/socket hang up/.test(err.message) &&
                !/EAI_AGAIN/.test(err.message) &&
                !/network timeout/.test(err.message)
            ) {
                throw err;
            }
            console.error('etherscan API request timed out, trying again...');
        }
    }
    if (result.status != '1') {
        console.error(`Verification failed for contract ${name}: ${result.message}: ${result.result}`.red.bold);
        console.error(`Save input.json and manually verify with the following data`);
        console.error(JSON.stringify({ name, address, cargs }, null, 2));
        return;
    }
    console.log(
        `Successfully verified source code for ${name.bold} on ${network} at ${address.green.bold} (ref: ${result.result})!`,
    );
}

function findContractPathSpec(inputSources, name) {
    for (const file of Object.keys(inputSources)) {
        if (file.endsWith(`/${name}.sol`)) {
            return `${file}:${name}`;
        }
    }
}

function addToVerifyQueue(name, address, cargs) {
    VERIFY_QUEUE.push({ name, address, cargs });
}

async function verifyQueuedSources(eth, delay = 60000) {
    if (VERIFY_QUEUE.length === 0) {
        return;
    }
    console.info('verifying deployed contract sources...');
    const queue = VERIFY_QUEUE.splice(0, VERIFY_QUEUE.length);
    for (let i = 0; i < queue.length; ++i) {
        await wait(delay);
        const q = queue[i];
        await verifySource(eth, q.name, q.address, q.cargs);
    }
}

async function enterSenderContext(cb, yes = !!process.env.YES) {
    const eth = new FlexEther({ provider: await createProvider() });
    const network = await getCurrentNetworkName(eth);
    const simulated = IS_ON_GANACHE;
    if (!yes) {
        const { answer } = await prompt.get({
            name: 'answer',
            message: `This will execute the transactions from the account ${SENDER.yellow.bold} on network ${
                network.yellow.bold
            }${simulated ? ' (SIMULATED)'.green : ''}. Ready? (y/n)`,
        });
        if (!['y', 'yes'].includes(answer.toLowerCase())) {
            throw new Error('User did not confirm action');
        }
    }

    if (simulated) {
        await eth.transfer(SENDER, new BigNumber('10e18').toString(10));
    }
    const startingBalance = await eth.getBalance(SENDER);
    await cb(await createSenderContext(eth));
    const cost = new BigNumber(startingBalance).minus(await eth.getBalance(SENDER));
    console.log(`total sender (${SENDER.gray}) cost:`, cost.div('1e18').toString(10).red);
    if (!simulated) {
        await verifyQueuedSources(eth);
    }
    return cost;
}

async function createSenderContext(eth) {
    const prefixArgsWithEth = cb => {
        return (...args) => cb(eth, ...args);
    };
    return {
        eth,
        encodeGovernorRollbackCallDataFromReceipt,
        network: await getCurrentNetworkName(eth),
        chainId: await eth.getChainId(),
        sender: SENDER,
        confirmations: MIN_CONFIRMATIONS,
        simulated: IS_ON_GANACHE,
        getCommonSendOpts: prefixArgsWithEth(getCommonSendOpts),
        ganacheExecuteGovernorCallData: prefixArgsWithEth(ganacheExecuteGovernorCallData),
        verifySource: prefixArgsWithEth(verifySource),
        verifyQueuedSources: prefixArgsWithEth(verifyQueuedSources),
        deployEcosystemContract: prefixArgsWithEth(deployEcosystemContract),
        deployTransformer: prefixArgsWithEth(deployTransformer),
        createEcosystemContract: prefixArgsWithEth(createEcosystemContract),
        createLocalContract: prefixArgsWithEth(createLocalContract),
    };
}

async function executeSenderContext(cb, yes) {
    return main(async () => enterSenderContext(cb, yes));
}

async function main(cb) {
    try {
        await cb();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
    process.exit(0);
}

async function ganacheExecuteGovernorCallData(eth, governor, governorCallData, signersOverride = undefined) {
    if (!IS_ON_GANACHE) {
        throw new Error(`Not on ganache!`);
    }
    const requiredConfirmations = await governor.required().call();
    const timeLock = await governor.secondsTimeLocked().call();
    // Unlock the governor signer accounts.
    const signers = signersOverride || (await governor.getOwners().call());
    for (const signer of signers) {
        console.log(`unlocking account ${signer}...`);
        await eth.rpc._send('evm_unlockUnknownAccount', [signer]);
        // Fund the signer.
        await eth.transfer(signer, new BigNumber('2e18').toString(10));
    }

    const sendOpts = {
        ...(await getCommonSendOpts(eth)),
        key: undefined,
        gasPrice: 0,
    };
    // Submit the governor tx.
    const r = await governor
        .submitTransaction(governor.address, 0, governorCallData)
        .send({ ...sendOpts, from: signers[0] });
    const txId = r.events.filter(e => e.name === 'Submission')[0].args.transactionId;
    // Confirm the governor tx.
    console.info(`submitted governor txId: ${txId}`);
    for (let i = 1; i < requiredConfirmations; ++i) {
        console.info(`\tconfirming tx (${i + 1}/${requiredConfirmations})...`);
        await governor.confirmTransaction(txId).send({ ...sendOpts, from: signers[i] });
    }
    // Advance the timelock.
    if (timeLock > 1) {
        console.info(`skipping timelock (${timeLock}s)...`);
        await eth.rpc._send('evm_increaseTime', [timeLock]);
    }
    // Execute the governor tx.
    console.info(`executing tx...`);
    return governor.executeTransaction(txId).send({ ...sendOpts, from: signers[0] });
}

async function encodeGovernorRollbackCallDataFromReceipt(zeroEx, governor, receipt) {
    // Find all ProxyFunctionUpdated events.
    const events = receipt.findEvents('ProxyFunctionUpdated');
    return encodeGovernorCalls(
        await Promise.all(
            events.map(async ({ args }) => ({
                to: zeroEx.address,
                value: 0,
                data: await zeroEx.rollback(args.selector, args.oldImpl).encode(),
            })),
        ),
    );
}

const numba = {
    eq(a, b) {
        return new BigNumber(a).eq(b);
    },
    ne(a, b) {
        return !new bignumber(a).eq(b);
    },
    lt(a, b) {
        return new BigNumber(a).lt(b);
    },
    gt(a, b) {
        return new BigNumber(a).gt(b);
    },
    lte(a, b) {
        return new BigNumber(a).lte(b);
    },
    gte(a, b) {
        return new BigNumber(a).gte(b);
    },
    add(a, b) {
        return new BigNumber(a).plus(b).toString(10);
    },
    sub(a, b) {
        return new BigNumber(a).minus(b).toString(10);
    },
    mul(a, b) {
        return new BigNumber(a).times(b).toString(10);
    },
    int(a) {
        return new BigNumber(a).integerValue();
    },
};

function isSameAddress(a, b) {
    return a.toLowerCase() === b.toLowerCase();
}

module.exports = {
    SECRETS,
    SENDER,
    NULL_ADDRESS,
    NULL_BYES: '0x',
    verifySource,
    verifyQueuedSources,
    addToVerifyQueue,
    createEcosystemContract,
    getEcosystemArtifact,
    getEcosystemInputArtifact,
    wait,
    deployEcosystemContract,
    deployTransformer,
    encodeGovernorCalls,
    encodeGovernorRollbackCallDataFromReceipt,
    enterSenderContext,
    toHexWord,
    main,
    ganacheExecuteGovernorCallData,
    executeSenderContext,
    numba,
    isSameAddress,
};
