const BigNumber = require('bignumber.js');
const assert = require('assert');
const FlexContract = require('flex-contract');
const ethjs = require('ethereumjs-util');
const { executeSenderContext, SECRETS, NULL_ADDRESS, encodeGovernorCalls } = require('../../../util');

const ZERO_EX_ROLLBACK_SELECTOR = '0x9db64a40'; // rollback(bytes4,address)
const CHAIN_CONFIG = {
    1101: {
        weth: '0x4F9A0e7FD2Bf6067db6994CF12E4495Df938E6e9',
        exchangeProxy: '0xDef1C0ded9bec7F1a1670819833240f027b25EfF',
        exchangeProxyGovernor: '0xa30f4A60A27dDead178c01EF80454A521b727328',
        transformerDeployer: '0xa50C6Cd7CE71e4909724606fe4885904E3C9F1BF',
    },
};

executeSenderContext(
    async ({
        chainId,
        createEcosystemContract,
        ganacheExecuteGovernorCallData,
        encodeGovernorRollbackCallDataFromReceipt,
        simulated,
    }) => {
        const cfg = CHAIN_CONFIG[chainId];
        const zeroEx = await createEcosystemContract('zero-ex/IZeroEx', cfg.exchangeProxy);
        const governor = await createEcosystemContract('multisig/ZeroExGovernor', cfg.exchangeProxyGovernor);

        const governorCalldata = encodeGovernorCalls([
            // no timelock for `rollback(bytes4,address)`
            {
                to: governor.address,
                value: 0,
                data: await governor.registerFunctionCall(
                    true,
                    ZERO_EX_ROLLBACK_SELECTOR,
                    zeroEx.address,
                    0,
                ).encode(),
            },
            // set minimum signers to 2
            {
                to: governor.address,
                value: 0,
                data: await governor.changeRequirement(2).encode(),
            },
            // set the default time lock to 24 hours
            {
                to: governor.address,
                value: 0,
                data: await governor.changeTimeLock(24 * 60 * 60).encode(),
            },
        ]);
        console.info(`governor calldata: ${governorCalldata.bold.yellow}`)

        if (simulated) {
            const tx = await ganacheExecuteGovernorCallData(governor, governorCalldata);
            console.info(tx.events);

            assert(await governor.secondsTimeLocked().call() === (24 * 60 * 60).toString());
            console.info('☑ default timelock is correct'.bold.green);

            {
                const { hasCustomTimeLock, secondsTimeLocked } =
                    await governor.functionCallTimeLocks(
                        ZERO_EX_ROLLBACK_SELECTOR,
                        zeroEx.address,
                    ).call();
                assert(hasCustomTimeLock === true);
                assert(secondsTimeLocked === (0).toString());
                console.info('☑ rollback timelock is zero'.bold.green);
            }

            assert(await governor.required().call() === (2).toString());
            console.info('☑ required signatures is 2'.bold.green);
        }
    }
);
