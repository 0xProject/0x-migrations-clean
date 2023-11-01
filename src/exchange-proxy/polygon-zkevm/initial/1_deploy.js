const BigNumber = require('bignumber.js');
const assert = require('assert');
const FlexContract = require('flex-contract');
const ethjs = require('ethereumjs-util');
const { executeSenderContext, SECRETS, isSameAddress, NULL_ADDRESS, verifyQueuedSources, addToVerifyQueue } = require('../../../util');
const DEPLOYER_ARTIFACT = require('./ZeroExDeployer.json');

const CHAIN_CONFIG = {
    1101: {
        weth: '0x4F9A0e7FD2Bf6067db6994CF12E4495Df938E6e9',
        exchangeProxy: '0xDef1C0ded9bec7F1a1670819833240f027b25EfF',
        exchangeProxyGovernor: '',
        transformerDeployer: '',
        staking: NULL_ADDRESS,
        protocolFeeMultiplier: 0,
        transformerSigners: [
            '0xD6B66609E5C05210BE0A690aB3b9788BA97aFa60', // duncancmt
            '0x24420bC8C760787F3eEF3b809e81f44d31a9c5A2', // jacob
            '0x000000c397124D0375555F435e201F83B636C26C', // kyu
            '0x6879fAb591ed0d62537A3Cac9D7cd41218445a84', // sav
            '0x755588A2422E4779aC30cBD3774BBB12521d2c15', // josh
            '0xDCa4ee0070b4aa44b30D8af22F3CBbb2cC859dAf', // kevin
        ],
        governorSigners: [
            '0x9E4496adE6096b000C856219C27734F4f89A5210', // amir (sidechain)
            '0x257619B7155d247e43c8B6d90C8c17278Ae481F0', // will
            '0x5A9d540A07a96a2bfC8a8dfd638359778C72526f', // jacob (sidechain)
            '0xe982f56B645E9858e865F8335Af157e9E6e12F9e', // phil (sidechain)
            '0xD88a4aFCEC49e6BFd18d1eb405259296657332e2', // theo
        ],
    },
};

async function deployZeroEx(eth, createEcosystemContract, cargs, sendOpts) {
    // Need to go through a special deployer contract to get the same vanity
    // address as mainnet.
    const deployer = new FlexContract(DEPLOYER_ARTIFACT.abi, {
        bytecode: DEPLOYER_ARTIFACT.bytecode,
        eth,
    });
    const deployCode = await createEcosystemContract('zero-ex/ZeroEx')
        .new(...cargs)
        .encode();
    const r = await deployer.new(deployCode).send(sendOpts);

    // The first unindexed param in the only log emitted is the deployed address.
    const address = ethjs.bufferToHex(ethjs.setLengthLeft(ethjs.toBuffer(r.logs[0].data), 20));
    addToVerifyQueue('zero-ex/ZeroEx', address, cargs);

    return createEcosystemContract('zero-ex/IZeroEx', address);
}

executeSenderContext(
    async ({
        chainId,
        sender,
        getCommonSendOpts,
        simulated,
        createEcosystemContract,
        deployEcosystemContract,
        deployTransformer,
        eth,
    }) => {
        const cfg = CHAIN_CONFIG[chainId];
        const sendOpts = await getCommonSendOpts();
        const isSenderATransformerSigner = cfg.transformerSigners.some(a => isSameAddress(a, sender));

        if (simulated) {
            // Fund the vanity deployer.
            const vanityDeployer = ethjs.bufferToHex(ethjs.privateToAddress(ethjs.toBuffer(SECRETS.vanityDeployerKey)));
            console.info(`funding vanity deployer ${vanityDeployer.bold.yellow}`);
            await eth.transfer(vanityDeployer, new BigNumber('1e17').toString(10));
        }

        // Deploy the migration contract.
        const initialMigrator = await deployEcosystemContract('zero-ex/InitialMigration', [sender]);

        // Deploy the EP proxy
        const zeroEx = await deployZeroEx(eth, createEcosystemContract, [initialMigrator.address], {
            ...sendOpts,
            key: SECRETS.vanityDeployerKey,
        });
        console.info(`deployed ZeroEx at ${zeroEx.address.bold.yellow}`);

        // Deploy the transformer deployer.
        const transformerDeployer = await deployEcosystemContract('zero-ex/TransformerDeployer', [
            [...cfg.transformerSigners, ...(isSenderATransformerSigner ? [] : [sender])],
        ]);
        const feeCollectorController = await deployEcosystemContract('zero-ex/FeeCollectorController', [
            cfg.weth,
            cfg.staking,
        ]);

        // Deploy the features.
        const features = {
            registry: await deployEcosystemContract('zero-ex/SimpleFunctionRegistryFeature'),
            ownable: await deployEcosystemContract('zero-ex/OwnableFeature'),
            transformERC20: await deployEcosystemContract('zero-ex/TransformERC20Feature'),
            nativeOrders: await deployEcosystemContract('zero-ex/NativeOrdersFeature', [
                zeroEx.address,
                cfg.weth,
                cfg.staking,
                feeCollectorController.address,
                cfg.protocolFeeMultiplier,
            ]),
            otcOrders: await deployEcosystemContract('zero-ex/OtcOrdersFeature', [ zeroEx.address, cfg.weth ]),
            erc721Orders: await deployEcosystemContract('zero-ex/ERC721OrdersFeature', [ zeroEx.address, cfg.weth ]),
            erc1155Orders: await deployEcosystemContract('zero-ex/ERC1155OrdersFeature', [ zeroEx.address, cfg.weth ]),
            metaTxV2: await deployEcosystemContract('zero-ex/MetaTransactionsFeatureV2', [ zeroEx.address, cfg.weth ]),
        };

        // Bootstrap the exchange proxy.
        console.info(`bootstrapping...`);
        await initialMigrator
            .initializeZeroEx(sender, zeroEx.address, {
                registry: features.registry.address,
                ownable: features.ownable.address,
            })
            .send(sendOpts);

        // Migrate the extra features.
        console.info(`migrating TransformERC20...`);
        await zeroEx
            .migrate(
                features.transformERC20.address,
                await features.transformERC20.migrate(transformerDeployer.address).encode(),
                sender,
            )
            .send(sendOpts);

        console.info(`migrating NativeOrders...`);
        await zeroEx
            .migrate(features.nativeOrders.address, await features.nativeOrders.migrate().encode(), sender)
            .send(sendOpts);

        console.info(`migrating OtcOrders...`);
        await zeroEx
            .migrate(features.otcOrders.address, await features.otcOrders.migrate().encode(), sender)
            .send(sendOpts);

        console.info(`migrating ERC721Orders...`);
        await zeroEx
            .migrate(features.erc721Orders.address, await features.erc721Orders.migrate().encode(), sender)
            .send(sendOpts);

        console.info(`migrating ERC1155Orders...`);
        await zeroEx
            .migrate(features.erc1155Orders.address, await features.erc1155Orders.migrate().encode(), sender)
            .send(sendOpts);

        console.info(`migrating MetaTransactionsFeatureV2...`);
        await zeroEx
            .migrate(features.metaTxV2.address, await features.metaTxV2.migrate().encode(), sender)
            .send(sendOpts);

        const flashWalletAddress = await zeroEx.getTransformWallet().call();
        console.info(`Flash wallet is at: ${flashWalletAddress.bold.yellow}`);

        // Deploy the transformers.
        await deployTransformer(
            transformerDeployer, 'FillQuoteTransformer',
            [
                (await deployEcosystemContract('zero-ex/PolygonZkevmBridgeAdapter', [cfg.weth])).address,
                zeroEx.address
            ]);
        await deployTransformer(transformerDeployer, 'PayTakerTransformer');
        await deployTransformer(transformerDeployer, 'AffiliateFeeTransformer');
        await deployTransformer(transformerDeployer, 'PositiveSlippageFeeTransformer');
        await deployTransformer(transformerDeployer, 'WethTransformer', [cfg.weth]);

        // Deploy the governor.
        console.info(`deploying governor...`);
        const governor = await deployEcosystemContract('multisig/ZeroExGovernor', [
            [], // No special function rules
            [], // No special function rules
            [], // No special function rules
            cfg.governorSigners,
            1, // 1-of-N
            0, // No timelock
        ]);

        if (!isSenderATransformerSigner) {
            console.info(`removing deployer from transformer deployer signers...`);
            await transformerDeployer.removeAuthorizedAddress(sender).send(sendOpts);
        }
        console.info(`transferring ownership to the governor...`);
        await zeroEx.transferOwnership(governor.address).send(sendOpts);
        assert.strictEqual(await zeroEx.owner().call(), governor.address);
        await transformerDeployer.transferOwnership(governor.address).send(sendOpts);
        assert.strictEqual(await transformerDeployer.owner().call(), governor.address);
    },
);
