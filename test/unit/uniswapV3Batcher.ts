import { expect } from '../shared/expect'
import { ethers, waffle } from 'hardhat'

import {
    deployBaseContracts,
    FeeAmount,
    getAddresses,
    getDeadline,
    getImpersonatedSigner,
    getMaxTick,
    getMinTick,
    TICK_SPACINGS,
    toWei,
} from '@test/helpers'
import { IERC20, INonfungiblePositionManager, UniswapV3Batcher } from '@custom-types/contracts'
import { PayableOverrides } from '@ethersproject/contracts'

describe('UniswapV3Batcher', () => {
    let nftPositionManager: INonfungiblePositionManager
    let uniswapV3Batcher: UniswapV3Batcher
    let token0Contract: IERC20
    let token1Contract: IERC20
    let user
    let signer
    let userSigner
    let tokenIds = []
    let lastTokenId = 0

    const override: PayableOverrides = { value: toWei('0.1') }

    before(async () => {
        const { userAddress, ownerAddress, externalOwnerAddress } = await getAddresses()
        user = userAddress
        signer = await getImpersonatedSigner(ownerAddress)
        userSigner = await getImpersonatedSigner(userAddress)
        const externalSigner = await getImpersonatedSigner(externalOwnerAddress)

        const { token0, token1, nft, pool } = await deployBaseContracts()
        token0Contract = token0
        token1Contract = token1
        nftPositionManager = nft
        await nftPositionManager.deployed()

        await token0.connect(externalSigner).transfer(userAddress, toWei('50'))
        await token1.connect(externalSigner).transfer(userAddress, toWei('50'))

        const UniswapV3Batcher = await ethers.getContractFactory('UniswapV3Batcher', signer)
        uniswapV3Batcher = (await UniswapV3Batcher.deploy(nftPositionManager.address)) as UniswapV3Batcher
        await uniswapV3Batcher.deployed()

        await token0.connect(userSigner).approve(nft.address, toWei('50'))
        await token1.connect(userSigner).approve(nft.address, toWei('50'))

        await nftPositionManager.connect(userSigner).mint({
            token0: token0.address,
            token1: token1.address,
            fee: FeeAmount.THIRTY,
            tickLower: getMinTick(TICK_SPACINGS[FeeAmount.THIRTY]),
            tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.THIRTY]),
            amount0Desired: toWei('1'),
            amount1Desired: toWei('1'),
            amount0Min: toWei('1'),
            amount1Min: toWei('1'),
            recipient: userAddress,
            deadline: getDeadline(),
        })
        tokenIds.push(await (await nftPositionManager.tokenOfOwnerByIndex(user, 0)).toNumber())
        ++lastTokenId
    })

    it('Should return the nft position manager address', async () => {
        expect(await uniswapV3Batcher.nftPositionManager()).to.equal(nftPositionManager.address)
    })

    it('Should revert collect if fee too low', async () => {
        await expect(uniswapV3Batcher.connect(userSigner).collect([tokenIds])).to.be.revertedWith('Fee too low')
    })

    it('Should revert collect if not approved', async () => {
        await expect(uniswapV3Batcher.connect(userSigner).collect([tokenIds], override)).to.be.revertedWith(
            'Not approved'
        )
    })

    it('Should revert collect and burn if fee too low', async () => {
        await expect(
            uniswapV3Batcher.connect(userSigner).collectAndClose([
                {
                    tokenId: tokenIds[0],
                    amount0Min: toWei('0.5'),
                    amount1Min: toWei('0.5'),
                    deadline: getDeadline(),
                    shouldBurn: true,
                    shouldClose: true,
                },
            ])
        ).to.be.revertedWith('Fee too low')
    })

    it('Should revert collect and burn if not approved', async () => {
        await expect(
            uniswapV3Batcher.connect(userSigner).collectAndClose(
                [
                    {
                        tokenId: tokenIds[0],
                        amount0Min: toWei('0.5'),
                        amount1Min: toWei('0.5'),
                        deadline: getDeadline(),
                        shouldBurn: true,
                        shouldClose: true,
                    },
                ],
                override
            )
        ).to.be.revertedWith('Not approved')
    })

    it('Should revert mint if fee too low', async () => {
        await expect(
            uniswapV3Batcher.connect(userSigner).mint(
                [
                    {
                        token0: token0Contract.address,
                        token1: token1Contract.address,
                        fee: FeeAmount.THIRTY,
                        tickLower: getMinTick(TICK_SPACINGS[FeeAmount.THIRTY]),
                        tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.THIRTY]),
                        amount0Desired: toWei('1'),
                        amount1Desired: toWei('1'),
                        amount0Min: toWei('1'),
                        amount1Min: toWei('1'),
                        deadline: getDeadline(),
                    },
                ],
                [
                    {
                        token: token0Contract.address,
                        amount: toWei('1'),
                    },
                    {
                        token: token1Contract.address,
                        amount: toWei('1'),
                    },
                ]
            )
        ).to.be.revertedWith('Fee too low')
    })

    it('Should revert mint if not approved', async () => {
        await expect(
            uniswapV3Batcher.connect(userSigner).mint(
                [
                    {
                        token0: token0Contract.address,
                        token1: token1Contract.address,
                        fee: FeeAmount.THIRTY,
                        tickLower: getMinTick(TICK_SPACINGS[FeeAmount.THIRTY]),
                        tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.THIRTY]),
                        amount0Desired: toWei('1'),
                        amount1Desired: toWei('1'),
                        amount0Min: toWei('1'),
                        amount1Min: toWei('1'),
                        deadline: getDeadline(),
                    },
                ],
                [
                    {
                        token: token0Contract.address,
                        amount: toWei('1'),
                    },
                    {
                        token: token1Contract.address,
                        amount: toWei('1'),
                    },
                ],
                override
            )
        ).to.be.revertedWith('WETH: Not allowed to transfer')
    })

    it('Should revert rerange if fee too low', async () => {
        await expect(
            uniswapV3Batcher.connect(userSigner).rerange(
                [
                    {
                        token0: token0Contract.address,
                        token1: token1Contract.address,
                        fee: FeeAmount.THIRTY,
                        tickLower: getMinTick(TICK_SPACINGS[FeeAmount.THIRTY]),
                        tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.THIRTY]),
                        amount0Desired: toWei('1'),
                        amount1Desired: toWei('1'),
                        amount0Min: toWei('1'),
                        amount1Min: toWei('1'),
                        deadline: getDeadline(),
                    },
                ],
                [
                    {
                        token: token0Contract.address,
                        amount: toWei('1'),
                    },
                    {
                        token: token1Contract.address,
                        amount: toWei('1'),
                    },
                ],
                [
                    {
                        tokenId: tokenIds[0],
                        amount0Min: toWei('0.5'),
                        amount1Min: toWei('0.5'),
                        deadline: getDeadline(),
                        shouldBurn: true,
                        shouldClose: true,
                    },
                ]
            )
        ).to.be.revertedWith('Fee too low')
    })

    it('Should revert rerange if not approved', async () => {
        await expect(
            uniswapV3Batcher.connect(userSigner).rerange(
                [
                    {
                        token0: token0Contract.address,
                        token1: token1Contract.address,
                        fee: FeeAmount.THIRTY,
                        tickLower: getMinTick(TICK_SPACINGS[FeeAmount.THIRTY]),
                        tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.THIRTY]),
                        amount0Desired: toWei('1'),
                        amount1Desired: toWei('1'),
                        amount0Min: toWei('1'),
                        amount1Min: toWei('1'),
                        deadline: getDeadline(),
                    },
                ],
                [
                    {
                        token: token0Contract.address,
                        amount: toWei('1'),
                    },
                    {
                        token: token1Contract.address,
                        amount: toWei('1'),
                    },
                ],
                [
                    {
                        tokenId: tokenIds[0],
                        amount0Min: toWei('0.5'),
                        amount1Min: toWei('0.5'),
                        deadline: getDeadline(),
                        shouldBurn: true,
                        shouldClose: true,
                    },
                ],
                override
            )
        ).to.be.revertedWith('Not approved')
    })

    describe('Approved', () => {
        before(async () => {
            await nftPositionManager.connect(userSigner).setApprovalForAll(uniswapV3Batcher.address, true)
            await token0Contract.connect(userSigner).approve(uniswapV3Batcher.address, toWei('50'))
            await token1Contract.connect(userSigner).approve(uniswapV3Batcher.address, toWei('50'))
        })

        after(async () => {
            const params = []
            for (const id of tokenIds) {
                params.push({
                    tokenId: id,
                    amount0Min: toWei((1 * 0.95).toString()),
                    amount1Min: toWei((1 * 0.95).toString()),
                    deadline: getDeadline(),
                    shouldBurn: true,
                    shouldClose: true,
                })
            }
            await uniswapV3Batcher.connect(userSigner).collectAndClose(params, override)
            tokenIds = []
        })

        it('Should collect', async () => {
            await expect(uniswapV3Batcher.connect(userSigner).collect([tokenIds], override)).to.be.not.reverted
        })

        it('Should revert collect and burn on price slip', async () => {
            await expect(
                uniswapV3Batcher.connect(userSigner).collectAndClose(
                    [
                        {
                            tokenId: tokenIds[0],
                            amount0Min: toWei('1'),
                            amount1Min: toWei('1'),
                            deadline: getDeadline(),
                            shouldBurn: true,
                            shouldClose: true,
                        },
                    ],
                    override
                )
            ).to.be.revertedWith('Price slippage check')
        })

        it('Should revert collect and burn on expired deadline', async () => {
            await expect(
                uniswapV3Batcher.connect(userSigner).collectAndClose(
                    [
                        {
                            tokenId: tokenIds[0],
                            amount0Min: toWei('1'),
                            amount1Min: toWei('1'),
                            deadline: 1,
                            shouldBurn: true,
                            shouldClose: true,
                        },
                    ],
                    override
                )
            ).to.be.revertedWith('Transaction too old')
        })

        it('Should mint', async () => {
            const tokenId = ++lastTokenId
            await expect(
                uniswapV3Batcher.connect(userSigner).mint(
                    [
                        {
                            token0: token0Contract.address,
                            token1: token1Contract.address,
                            fee: FeeAmount.THIRTY,
                            tickLower: getMinTick(TICK_SPACINGS[FeeAmount.THIRTY]),
                            tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.THIRTY]),
                            amount0Desired: toWei('1'),
                            amount1Desired: toWei('1'),
                            amount0Min: toWei('1'),
                            amount1Min: toWei('1'),
                            deadline: getDeadline(),
                        },
                    ],
                    [
                        {
                            token: token0Contract.address,
                            amount: toWei('1'),
                        },
                        {
                            token: token1Contract.address,
                            amount: toWei('1'),
                        },
                    ],
                    override
                )
            )
                .to.emit(uniswapV3Batcher, 'Minted')
                .withArgs(tokenId)
            tokenIds.push(tokenId)
            expect(await nftPositionManager.tokenOfOwnerByIndex(user, tokenIds.length - 1)).to.be.equal(tokenId)
        })

        it('Should return dust upon mint', async () => {
            const tokenId = ++lastTokenId
            const token0Balance = await token0Contract.balanceOf(user)
            await uniswapV3Batcher.connect(userSigner).mint(
                [
                    {
                        token0: token0Contract.address,
                        token1: token1Contract.address,
                        fee: FeeAmount.THIRTY,
                        tickLower: getMinTick(TICK_SPACINGS[FeeAmount.THIRTY]),
                        tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.THIRTY]),
                        amount0Desired: toWei('2'),
                        amount1Desired: toWei('1'),
                        amount0Min: toWei('1'),
                        amount1Min: toWei('1'),
                        deadline: getDeadline(),
                    },
                ],
                [
                    {
                        token: token0Contract.address,
                        amount: toWei('2'),
                    },
                    {
                        token: token1Contract.address,
                        amount: toWei('1'),
                    },
                ],
                override
            )
            tokenIds.push(tokenId)
            expect(await token0Contract.balanceOf(user)).to.be.equal(token0Balance.sub(toWei('1'))) // sent 2 ETH, 1 should be returned due to 1:1 pool ratio
        })

        it('Should return dust for other token upon mint', async () => {
            const tokenId = ++lastTokenId
            const token1Balance = await token1Contract.balanceOf(user)
            await uniswapV3Batcher.connect(userSigner).mint(
                [
                    {
                        token0: token0Contract.address,
                        token1: token1Contract.address,
                        fee: FeeAmount.THIRTY,
                        tickLower: getMinTick(TICK_SPACINGS[FeeAmount.THIRTY]),
                        tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.THIRTY]),
                        amount0Desired: toWei('1'),
                        amount1Desired: toWei('2'),
                        amount0Min: toWei('1'),
                        amount1Min: toWei('1'),
                        deadline: getDeadline(),
                    },
                ],
                [
                    {
                        token: token0Contract.address,
                        amount: toWei('1'),
                    },
                    {
                        token: token1Contract.address,
                        amount: toWei('2'),
                    },
                ],
                override
            )
            tokenIds.push(tokenId)
            expect(await token1Contract.balanceOf(user)).to.be.equal(token1Balance.sub(toWei('1'))) // sent 2 ETH, 1 should be returned due to 1:1 pool ratio
        })

        it('Should collect and burn', async () => {
            const balance = await token0Contract.balanceOf(user)
            await expect(
                uniswapV3Batcher.connect(userSigner).collectAndClose(
                    [
                        {
                            tokenId: tokenIds[0],
                            amount0Min: toWei((1 * 0.95).toString()),
                            amount1Min: toWei((1 * 0.95).toString()),
                            deadline: getDeadline(),
                            shouldBurn: true,
                            shouldClose: true,
                        },
                    ],
                    override
                )
            ).to.be.not.reverted
            await expect(nftPositionManager.ownerOf(tokenIds[0])).to.be.revertedWith(
                'ERC721: owner query for nonexistent token'
            )
            expect(await token0Contract.balanceOf(user)).to.be.above(balance)
            tokenIds.shift()
        })
    })

    describe('Multiple Mints', () => {
        before(async () => {
            const params = []
            for (const id of tokenIds) {
                params.push({
                    tokenId: id,
                    amount0Min: toWei((1 * 0.95).toString()),
                    amount1Min: toWei((1 * 0.95).toString()),
                    deadline: getDeadline(),
                    shouldBurn: true,
                    shouldClose: true,
                })
            }
            await uniswapV3Batcher.connect(userSigner).collectAndClose(params, override)
            tokenIds = []
        })

        after(async () => {
            const params = []
            for (const id of tokenIds) {
                params.push({
                    tokenId: id,
                    amount0Min: toWei((1 * 0.95).toString()),
                    amount1Min: toWei((1 * 0.95).toString()),
                    deadline: getDeadline(),
                    shouldBurn: true,
                    shouldClose: true,
                })
            }
            await uniswapV3Batcher.connect(userSigner).collectAndClose(params, override)
            tokenIds = []
        })

        it('Should revert if not enough balance', async () => {
            await expect(
                uniswapV3Batcher.connect(userSigner).mint(
                    [
                        {
                            token0: token0Contract.address,
                            token1: token1Contract.address,
                            fee: FeeAmount.THIRTY,
                            tickLower: getMinTick(TICK_SPACINGS[FeeAmount.THIRTY]),
                            tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.THIRTY]),
                            amount0Desired: toWei('1'),
                            amount1Desired: toWei('1'),
                            amount0Min: toWei('1'),
                            amount1Min: toWei('1'),
                            deadline: getDeadline(),
                        },
                        {
                            token0: token0Contract.address,
                            token1: token1Contract.address,
                            fee: FeeAmount.THIRTY,
                            tickLower: getMinTick(TICK_SPACINGS[FeeAmount.THIRTY]),
                            tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.THIRTY]),
                            amount0Desired: toWei('1'),
                            amount1Desired: toWei('1'),
                            amount0Min: toWei('1'),
                            amount1Min: toWei('1'),
                            deadline: getDeadline(),
                        },
                    ],
                    [
                        {
                            token: token0Contract.address,
                            amount: toWei('1'),
                        },
                        {
                            token: token1Contract.address,
                            amount: toWei('1'),
                        },
                    ],
                    override
                )
            ).to.be.revertedWith('STF')
        })

        it('Should mint multiple positions', async () => {
            const params = []
            for (let i = 0; i < 5; i++) {
                params.push({
                    token0: token0Contract.address,
                    token1: token1Contract.address,
                    fee: FeeAmount.THIRTY,
                    tickLower: getMinTick(TICK_SPACINGS[FeeAmount.THIRTY]),
                    tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.THIRTY]),
                    amount0Desired: toWei('1'),
                    amount1Desired: toWei('1'),
                    amount0Min: toWei('1'),
                    amount1Min: toWei('1'),
                    deadline: getDeadline(),
                })
                tokenIds.push(++lastTokenId)
            }

            await expect(
                uniswapV3Batcher.connect(userSigner).mint(
                    params,
                    [
                        {
                            token: token0Contract.address,
                            amount: toWei('5'),
                        },
                        {
                            token: token1Contract.address,
                            amount: toWei('5'),
                        },
                    ],
                    override
                )
            ).to.emit(uniswapV3Batcher, 'Minted')
            expect(await nftPositionManager.tokenOfOwnerByIndex(user, 0)).to.be.equal(tokenIds[0])
            expect(await nftPositionManager.tokenOfOwnerByIndex(user, 1)).to.be.equal(tokenIds[1])
            expect(await nftPositionManager.tokenOfOwnerByIndex(user, 2)).to.be.equal(tokenIds[2])
        })
    })

    describe('Multiple Collects and Close', () => {
        before(async () => {
            tokenIds = []
            for (let i = 0; i < 5; i++) {
                await nftPositionManager.connect(userSigner).mint({
                    token0: token0Contract.address,
                    token1: token1Contract.address,
                    fee: FeeAmount.THIRTY,
                    tickLower: getMinTick(TICK_SPACINGS[FeeAmount.THIRTY]),
                    tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.THIRTY]),
                    amount0Desired: toWei('1'),
                    amount1Desired: toWei('1'),
                    amount0Min: toWei('1'),
                    amount1Min: toWei('1'),
                    recipient: user,
                    deadline: getDeadline(),
                })
                tokenIds.push(await (await nftPositionManager.tokenOfOwnerByIndex(user, i)).toNumber())
                ++lastTokenId
            }
        })

        it('Should collect', async () => {
            await expect(uniswapV3Batcher.connect(userSigner).collect(tokenIds, override)).to.be.not.reverted
        })

        it('Should collect and burn', async () => {
            const params = []
            for (const tokenId of tokenIds) {
                params.push({
                    tokenId: tokenId,
                    amount0Min: toWei((1 * 0.95).toString()),
                    amount1Min: toWei((1 * 0.95).toString()),
                    deadline: getDeadline(),
                    shouldBurn: true,
                    shouldClose: true,
                })
            }

            await expect(uniswapV3Batcher.connect(userSigner).collectAndClose(params, override)).to.be.not.reverted
            tokenIds.shift()
            tokenIds.shift()
            tokenIds.shift()
        })
    })

    describe('Rerange', () => {
        before(async () => {
            tokenIds = []
            for (let i = 0; i < 5; i++) {
                await nftPositionManager.connect(userSigner).mint({
                    token0: token0Contract.address,
                    token1: token1Contract.address,
                    fee: FeeAmount.THIRTY,
                    tickLower: getMinTick(TICK_SPACINGS[FeeAmount.THIRTY]),
                    tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.THIRTY]),
                    amount0Desired: toWei('1'),
                    amount1Desired: toWei('1'),
                    amount0Min: toWei('1'),
                    amount1Min: toWei('1'),
                    recipient: user,
                    deadline: getDeadline(),
                })
                tokenIds.push(await (await nftPositionManager.tokenOfOwnerByIndex(user, i)).toNumber())
                ++lastTokenId
            }
        })

        after(async () => {
            const params = []
            for (const id of tokenIds) {
                params.push({
                    tokenId: id,
                    amount0Min: toWei((1 * 0.95).toString()),
                    amount1Min: toWei((1 * 0.95).toString()),
                    deadline: getDeadline(),
                    shouldBurn: true,
                    shouldClose: true,
                })
            }
            await uniswapV3Batcher.connect(userSigner).collectAndClose(params, override)
            tokenIds = []
        })

        it('Should rerange', async () => {
            const newTokenId = ++lastTokenId
            await expect(
                uniswapV3Batcher.connect(userSigner).rerange(
                    [
                        {
                            token0: token0Contract.address,
                            token1: token1Contract.address,
                            fee: FeeAmount.THIRTY,
                            tickLower: getMinTick(TICK_SPACINGS[FeeAmount.THIRTY]),
                            tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.THIRTY]),
                            amount0Desired: toWei('1'),
                            amount1Desired: toWei('1'),
                            amount0Min: toWei('1'),
                            amount1Min: toWei('1'),
                            deadline: getDeadline(),
                        },
                    ],
                    [
                        {
                            token: token0Contract.address,
                            amount: toWei('1'),
                        },
                        {
                            token: token1Contract.address,
                            amount: toWei('1'),
                        },
                    ],
                    [
                        {
                            tokenId: tokenIds[0],
                            amount0Min: toWei((1 * 0.95).toString()),
                            amount1Min: toWei((1 * 0.95).toString()),
                            deadline: getDeadline(),
                            shouldBurn: true,
                            shouldClose: true,
                        },
                    ],
                    override
                )
            ).to.be.not.reverted
            await expect(nftPositionManager.ownerOf(tokenIds[0])).to.be.revertedWith(
                'ERC721: owner query for nonexistent token'
            )
            expect(await nftPositionManager.ownerOf(newTokenId)).to.be.equal(user)
            tokenIds.shift()
        })

        it('Should rerange with just collect', async () => {
            await expect(
                uniswapV3Batcher.connect(userSigner).rerange(
                    [],
                    [],
                    [
                        {
                            tokenId: tokenIds[0],
                            amount0Min: toWei((1 * 0.95).toString()),
                            amount1Min: toWei((1 * 0.95).toString()),
                            deadline: getDeadline(),
                            shouldBurn: false,
                            shouldClose: false,
                        },
                    ],
                    { value: toWei('0.0005') }
                )
            ).to.be.not.reverted
        })

        it('Should rerange with multiple mints and collects', async () => {
            const newTokenId0 = ++lastTokenId
            const newTokenId1 = ++lastTokenId
            await expect(
                uniswapV3Batcher.connect(userSigner).rerange(
                    [
                        {
                            token0: token0Contract.address,
                            token1: token1Contract.address,
                            fee: FeeAmount.THIRTY,
                            tickLower: getMinTick(TICK_SPACINGS[FeeAmount.THIRTY]),
                            tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.THIRTY]),
                            amount0Desired: toWei('1'),
                            amount1Desired: toWei('1'),
                            amount0Min: toWei('1'),
                            amount1Min: toWei('1'),
                            deadline: getDeadline(),
                        },
                        {
                            token0: token0Contract.address,
                            token1: token1Contract.address,
                            fee: FeeAmount.THIRTY,
                            tickLower: getMinTick(TICK_SPACINGS[FeeAmount.THIRTY]),
                            tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.THIRTY]),
                            amount0Desired: toWei('1'),
                            amount1Desired: toWei('1'),
                            amount0Min: toWei('1'),
                            amount1Min: toWei('1'),
                            deadline: getDeadline(),
                        },
                    ],
                    [
                        {
                            token: token0Contract.address,
                            amount: toWei('2'),
                        },
                        {
                            token: token1Contract.address,
                            amount: toWei('2'),
                        },
                    ],
                    [
                        {
                            tokenId: tokenIds[0],
                            amount0Min: toWei((1 * 0.95).toString()),
                            amount1Min: toWei((1 * 0.95).toString()),
                            deadline: getDeadline(),
                            shouldBurn: true,
                            shouldClose: true,
                        },
                        {
                            tokenId: tokenIds[1],
                            amount0Min: toWei((1 * 0.95).toString()),
                            amount1Min: toWei((1 * 0.95).toString()),
                            deadline: getDeadline(),
                            shouldBurn: true,
                            shouldClose: true,
                        },
                    ],
                    override
                )
            ).to.be.not.reverted
            await expect(nftPositionManager.ownerOf(tokenIds[0])).to.be.revertedWith(
                'ERC721: owner query for nonexistent token'
            )
            expect(await nftPositionManager.ownerOf(newTokenId0)).to.be.equal(user)
            expect(await nftPositionManager.ownerOf(newTokenId1)).to.be.equal(user)
            tokenIds.shift()
            tokenIds.shift()
        })
    })

    describe('Set Fee', () => {
        it('Should revert if not owner', async () => {
            await expect(uniswapV3Batcher.connect(userSigner).setFee(toWei('0.002'))).to.be.revertedWith(
                'Ownable: caller is not the owner'
            )
        })

        it('Should set fee', async () => {
            await expect(uniswapV3Batcher.connect(signer).setFee(toWei('0.002')))
                .to.emit(uniswapV3Batcher, 'FeeSet')
                .withArgs(toWei('0.0005'), toWei('0.002'))
            expect(await uniswapV3Batcher.fee()).to.be.equal(toWei('0.002'))
        })

        it('Should revert if new fee not high enough', async () => {
            await expect(
                uniswapV3Batcher.connect(userSigner).mint(
                    [
                        {
                            token0: token0Contract.address,
                            token1: token1Contract.address,
                            fee: FeeAmount.THIRTY,
                            tickLower: getMinTick(TICK_SPACINGS[FeeAmount.THIRTY]),
                            tickUpper: getMaxTick(TICK_SPACINGS[FeeAmount.THIRTY]),
                            amount0Desired: toWei('1'),
                            amount1Desired: toWei('1'),
                            amount0Min: toWei('1'),
                            amount1Min: toWei('1'),
                            deadline: getDeadline(),
                        },
                    ],
                    [
                        {
                            token: token0Contract.address,
                            amount: toWei('1'),
                        },
                        {
                            token: token1Contract.address,
                            amount: toWei('1'),
                        },
                    ],
                    { value: toWei('0.004') }
                )
            ).to.be.revertedWith('Fee too low')
        })
    })

    describe('Withdraw', () => {
        it('Should revert if not owner', async () => {
            await expect(uniswapV3Batcher.connect(userSigner).withdraw(user)).to.be.revertedWith(
                'Ownable: caller is not the owner'
            )
        })

        it('Should withdraw to address', async () => {
            const balance = await waffle.provider.getBalance(user)
            await expect(uniswapV3Batcher.connect(signer).withdraw(user)).to.be.not.reverted
            expect(await waffle.provider.getBalance(user)).to.be.above(balance)
        })
    })
})
