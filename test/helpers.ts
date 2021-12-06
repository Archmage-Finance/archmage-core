import hre, { ethers, artifacts, network } from 'hardhat'
import { BigNumber, BigNumberish, Signer, Contract } from 'ethers'
import { INonfungiblePositionManager, UniswapV3Factory, UniswapV3Pool, WETH9 } from '@custom-types/contracts'
import { NamedAddresses } from '@custom-types/types'
import { constants } from 'ethers'

import PositionManagerArtifacts from '@uniswap/v3-periphery/artifacts/contracts/NonfungiblePositionManager.sol/NonfungiblePositionManager.json'
import NFTDescriptorArtifacts from '@uniswap/v3-periphery/artifacts/contracts/libraries/NFTDescriptor.sol/NFTDescriptor.json'
import NonfungibleTokenPositionDescriptorArtifacts from '@uniswap/v3-periphery/artifacts/contracts/NonfungibleTokenPositionDescriptor.sol/NonfungibleTokenPositionDescriptor.json'
import UniswapV3FactoryArtifacts from '@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json'
import UniswapV3PoolArtifacts from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json'
import { computePoolAddress } from './shared/computePoolAddress'
import { encodePriceSqrt } from './shared/encodePriceSqrt'
import { sortedTokens } from './shared/sortedTokens'

const WETH9Artifact = artifacts.readArtifactSync('WETH9')
const ETHasBytes = '0x4554480000000000000000000000000000000000000000000000000000000000'

const getLinkedByteCode = (start: number, length: number, byteCode: string, address: string): string => {
    return byteCode.substr(0, 2 + start * 2) + address.substr(2) + byteCode.substr(2 + (start + length) * 2)
}

const deployNFTDescriptor = async (signer: Signer, weth: Contract): Promise<Contract> => {
    const nftDescriptorLibrary = await new ethers.ContractFactory(
        NFTDescriptorArtifacts.abi,
        NFTDescriptorArtifacts.bytecode,
        signer
    ).deploy()

    const { start, length } =
        NonfungibleTokenPositionDescriptorArtifacts.linkReferences['contracts/libraries/NFTDescriptor.sol'][
            'NFTDescriptor'
        ][0]
    const linkedBytecode = getLinkedByteCode(
        start,
        length,
        NonfungibleTokenPositionDescriptorArtifacts.bytecode,
        nftDescriptorLibrary.address
    )

    return await new ethers.ContractFactory(
        NonfungibleTokenPositionDescriptorArtifacts.abi,
        linkedBytecode,
        signer
    ).deploy(weth.address, ETHasBytes)
}

export const deployDevelopmentWeth = async (): Promise<WETH9> => {
    await network.provider.send('hardhat_setCode', [
        '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
        WETH9Artifact.deployedBytecode,
    ])

    const weth = (await ethers.getContractAt(WETH9Artifact.abi, '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2')) as WETH9
    await weth.init()
    return weth
}

export const getAddresses = async (): Promise<NamedAddresses> => {
    const [userAddress, ownerAddress, externalOwnerAddress] = (await ethers.getSigners()).map(
        (signer) => signer.address
    )

    return {
        userAddress,
        ownerAddress,
        externalOwnerAddress,
    }
}

export const getImpersonatedSigner = async (address: string): Promise<Signer> => {
    await hre.network.provider.request({
        method: 'hardhat_impersonateAccount',
        params: [address],
    })

    const signer = await ethers.getSigner(address)

    return signer
}

export const deployBaseContracts = async () => {
    const { externalOwnerAddress } = await getAddresses()

    const signer = await getImpersonatedSigner(externalOwnerAddress)

    // Deploy and mint some weth
    const weth = await deployDevelopmentWeth()
    await signer.sendTransaction({
        from: externalOwnerAddress,
        to: weth.address,
        value: toWei('100'),
    })

    // Deploy Uniswap V3 Factory
    const factory = (await new ethers.ContractFactory(
        UniswapV3FactoryArtifacts.abi,
        UniswapV3FactoryArtifacts.bytecode,
        signer
    ).deploy()) as UniswapV3Factory

    // Deploy NFT Descriptor
    const nftDescriptor = await deployNFTDescriptor(signer, weth)

    // Deploy NonfungiblePositionManager
    const nft = (await new ethers.ContractFactory(
        PositionManagerArtifacts.abi,
        PositionManagerArtifacts.bytecode,
        signer
    ).deploy(factory.address, weth.address, nftDescriptor.address)) as INonfungiblePositionManager

    // Deploy generic ERC20 token
    const Token1 = await ethers.getContractFactory('MockERC20', signer)
    const token1Contract = await Token1.deploy(constants.MaxUint256.div(2))
    await token1Contract.deployed()

    // Create and initialise WETH/TOKEN1 pool
    const [token0, token1] = sortedTokens(token1Contract, weth)
    await factory.createPool(weth.address, token1.address, FeeAmount.THIRTY)
    const expectedAddress = computePoolAddress(factory.address, [token0.address, token1.address], FeeAmount.THIRTY)
    const pool = new ethers.Contract(expectedAddress, UniswapV3PoolArtifacts.abi, signer) as UniswapV3Pool
    await pool.initialize(encodePriceSqrt(1, 1))

    return { token0, token1, nft, pool, factory }
}

export enum FeeAmount {
    ONE = 100,
    FIVE = 500,
    THIRTY = 3000,
    HUNDRED = 10000,
}

export const TICK_SPACINGS: { [amount in FeeAmount]: number } = {
    [FeeAmount.ONE]: 2,
    [FeeAmount.FIVE]: 10,
    [FeeAmount.THIRTY]: 60,
    [FeeAmount.HUNDRED]: 200,
}

export const getMinTick = (tickSpacing: number) => Math.ceil(-887272 / tickSpacing) * tickSpacing
export const getMaxTick = (tickSpacing: number) => Math.floor(887272 / tickSpacing) * tickSpacing
export const getDeadline = () => Math.floor(Date.now() / 1000) + 3600
export const toWei = ethers.utils.parseEther
