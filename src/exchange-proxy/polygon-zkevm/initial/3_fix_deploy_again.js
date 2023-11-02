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
                ['zero-ex/ZeroEx', '0xDef1C0ded9bec7F1a1670819833240f027b25EfF', ['0x0C8fcB0De780b52552Dddf73e4A21AD0F7860553']],
                ['zero-ex/InitialMigration', '0x0C8fcB0De780b52552Dddf73e4A21AD0F7860553', ['0xC51d9D28f720EBF82eFA7137835857Bd6037aFBD']],
                ['zero-ex/TransformerDeployer', '0xa50C6Cd7CE71e4909724606fe4885904E3C9F1BF', [
                    [
                        '0xD6B66609E5C05210BE0A690aB3b9788BA97aFa60',
                        '0x24420bC8C760787F3eEF3b809e81f44d31a9c5A2',
                        '0x000000c397124D0375555F435e201F83B636C26C',
                        '0x6879fAb591ed0d62537A3Cac9D7cd41218445a84',
                        '0x755588A2422E4779aC30cBD3774BBB12521d2c15',
                        '0xDCa4ee0070b4aa44b30D8af22F3CBbb2cC859dAf',
                    ]]],
                ['zero-ex/FeeCollectorController', '0xc8c10815bE32536685d12cE8305425163f0c6897',
                    [
                        '0x4F9A0e7FD2Bf6067db6994CF12E4495Df938E6e9',
                        NULL_ADDRESS,
                    ]
                ],
                ['zero-ex/SimpleFunctionRegistryFeature', '0x14fa9FA3b4Ec9fE639a9E04B5D02ee2Ea65bd3F9', []],
                ['zero-ex/OwnableFeature', '0x339d60bb0687366e71De5199F03a39D56c4eeeEd', []],
                ['zero-ex/TransformERC20Feature', '0xd744250A4979aB72f188685550416D448370E9f9', []],
                ['zero-ex/NativeOrdersFeature', '0x8D9198a4b9F0DeC4b93D88f326d7C53136BC85d2',
                    [
                        '0xDef1C0ded9bec7F1a1670819833240f027b25EfF',
                        '0x4F9A0e7FD2Bf6067db6994CF12E4495Df938E6e9',
                        NULL_ADDRESS,
                        '0xc8c10815bE32536685d12cE8305425163f0c6897',
                        0,
                    ]
                ],
                ['zero-ex/OtcOrdersFeature', '0x0175EC1564d88d79b04F74A0C8bF1797dF04ee5C',
                    [
                        '0xDef1C0ded9bec7F1a1670819833240f027b25EfF',
                        '0x4F9A0e7FD2Bf6067db6994CF12E4495Df938E6e9',
                    ]
                ],
                ['zero-ex/ERC721OrdersFeature', '0xD6aD34cEA9f72aa391dE520F39a45bf65B678d6B',
                    [
                        '0xDef1C0ded9bec7F1a1670819833240f027b25EfF',
                        '0x4F9A0e7FD2Bf6067db6994CF12E4495Df938E6e9',
                    ]
                ],
                ['zero-ex/ERC1155OrdersFeature', '0xd2a9dc0Cb360250A315eF9dc76790B58165fd3e6',
                    [
                        '0xDef1C0ded9bec7F1a1670819833240f027b25EfF',
                        '0x4F9A0e7FD2Bf6067db6994CF12E4495Df938E6e9',
                    ]
                ],
                ['zero-ex/MetaTransactionsFeatureV2', '0x125758B1d52029aFb966cE1f27d69CECC9206922',
                    [
                        '0xDef1C0ded9bec7F1a1670819833240f027b25EfF',
                        '0x4F9A0e7FD2Bf6067db6994CF12E4495Df938E6e9',
                    ]
                ],
                ['zero-ex/PolygonZkevmBridgeAdapter', '0xd780FCcD99072ff3b51182f5D4fCD90Bf684Baee',
                    [
                        '0x4F9A0e7FD2Bf6067db6994CF12E4495Df938E6e9',
                    ],
                ],
                ['zero-ex/FillQuoteTransformer', '0xaaA0B2978a0C0c60Ec54c8E85a4610729f15CE52',
                    [
                        '0xd780FCcD99072ff3b51182f5D4fCD90Bf684Baee',
                        '0xDef1C0ded9bec7F1a1670819833240f027b25EfF',
                    ],
                ],
                ['zero-ex/PayTakerTransformer', '0xF1EE9BCc5ff1f92D2e3316d95C64aB953d22eBA9'],
                ['zero-ex/AffiliateFeeTransformer', '0x4906D009f48874646934AC9773725562Ec4E50Ae'],
                ['zero-ex/PositiveSlippageFeeTransformer', '0x7636E7dd99C37e33bb1098e4eF08F037Eb0C6E36'],
                ['zero-ex/WethTransformer', '0x14Dce5deBDd3148397bF5d4d83ee68E93760090b',
                    [
                        '0x4F9A0e7FD2Bf6067db6994CF12E4495Df938E6e9',
                    ],
                ],
                ['multisig/ZeroExGovernor', '0xa30f4A60A27dDead178c01EF80454A521b727328',
                    [
                        [], // No special function rules
                        [], // No special function rules
                        [], // No special function rules
                        [
                            '0x9E4496adE6096b000C856219C27734F4f89A5210', // amir (sidechain)
                            '0x257619B7155d247e43c8B6d90C8c17278Ae481F0', // will
                            '0x5A9d540A07a96a2bfC8a8dfd638359778C72526f', // jacob (sidechain)
                            '0xe982f56B645E9858e865F8335Af157e9E6e12F9e', // phil (sidechain)
                            '0xD88a4aFCEC49e6BFd18d1eb405259296657332e2', // theo
                        ],
                        1, // 1-of-N
                        0, // No timelock
                    ],
                ],
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

        // Deploy the governor.
        console.info(`transferring ownership of transformer deployer to governor...`);
        const governor = await createEcosystemContract('multisig/ZeroExGovernor', cfg.exchangeProxyGovernor);
        const transformerDeployer = await createEcosystemContract('zero-ex/TransformerDeployer', cfg.transformerDeployer);

        await transformerDeployer.transferOwnership(governor.address).send(sendOpts);
    },
);
