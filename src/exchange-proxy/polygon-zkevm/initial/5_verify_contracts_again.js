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
        ecosystemContracts:
            [
                ['zero-ex/TransformerDeployer', '0xa50C6Cd7CE71e4909724606fe4885904E3C9F1BF', [
                    [
                        '0xD6B66609E5C05210BE0A690aB3b9788BA97aFa60',
                        '0x24420bC8C760787F3eEF3b809e81f44d31a9c5A2',
                        '0x000000c397124D0375555F435e201F83B636C26C',
                        '0x6879fAb591ed0d62537A3Cac9D7cd41218445a84',
                        '0x755588A2422E4779aC30cBD3774BBB12521d2c15',
                        '0xDCa4ee0070b4aa44b30D8af22F3CBbb2cC859dAf',
                        '0xC51d9D28f720EBF82eFA7137835857Bd6037aFBD',
                    ]]],
            ],
        exchangeProxyGovernor: '0xa30f4A60A27dDead178c01EF80454A521b727328',
        transformerDeployer: '0xa50C6Cd7CE71e4909724606fe4885904E3C9F1BF',
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
        for (let [src, addr, cargs] of cfg.ecosystemContracts) {
            addToVerifyQueue(src, addr, cargs);
        }
    },
);
