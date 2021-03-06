//SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./interfaces/IUniswapV3Batcher.sol";
import "./interfaces/INonfungiblePositionManager.sol";

/// @title Archmage Uniswap V3 Batcher
/// @notice Helper functions for managing Uniswap V3 positions
contract UniswapV3Batcher is IUniswapV3Batcher, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @dev Uniswap V3 Position Manager address
    INonfungiblePositionManager public immutable nftPositionManager;

    mapping(address => uint8) private _allowances;

    uint256 public fee = 500000000000000; // 0.0005 ETH

    constructor(address nftPositionManager_) {
        nftPositionManager = INonfungiblePositionManager(nftPositionManager_);
    }

    /// @inheritdoc IUniswapV3Batcher
    function collect(uint256[] calldata tokenIds) external payable override nonReentrant {
        require(msg.value >= fee * tokenIds.length, "Fee too low");

        for (uint256 i; i < tokenIds.length; i++) {

            _collect(tokenIds[i]);
        }
    }

    /// @inheritdoc IUniswapV3Batcher
    function collectAndClose(CollectParams[] calldata params) external payable override nonReentrant {
        require(msg.value >= fee * 2 * params.length, "Fee too low");

        _collectAndClose(params);
    }

    /// @inheritdoc IUniswapV3Batcher
    function mint(MintParams[] calldata params, BalanceParams[] calldata balances) external payable override nonReentrant returns (uint256[] memory tokenIds) {
        require(msg.value >= fee * 4 * params.length, "Fee too low");

        tokenIds = _mint(params, balances);
    }

    /// @inheritdoc IUniswapV3Batcher
    function rerange(
        MintParams[] calldata mintParams, 
        BalanceParams[] calldata balances, 
        CollectParams[] calldata collectParams
    ) external payable override nonReentrant returns (uint256[] memory tokenIds) {
        uint256 collectLength;
        uint256 collectAndCloseLength;
        for (uint256 i; i < collectParams.length; i++) {
            if (collectParams[i].shouldClose) {
                collectAndCloseLength++;
            } else {
                collectLength++;
            }
        }

        require(msg.value >= (fee * 4 * mintParams.length) + (fee * 2 * collectAndCloseLength) + (fee * collectLength), "Fee too low");

        _collectAndClose(collectParams);

        tokenIds = _mint(mintParams, balances);
    }

    /// @inheritdoc IUniswapV3Batcher
    function setFee(uint256 newFee) external override onlyOwner {
        uint256 oldFee = fee;
        fee = newFee;
        emit FeeSet(oldFee, newFee);
    }

    /// @inheritdoc IUniswapV3Batcher
    function withdraw(address usr) external override onlyOwner {
        payable(usr).transfer(address(this).balance);
    }

    function _mint(MintParams[] calldata params, BalanceParams[] calldata balances) internal returns (uint256[] memory tokenIds) {
        for (uint256 i; i < balances.length; i++) {
            BalanceParams memory balance = balances[i];
            _approve(balance.token);
            _transferFrom(msg.sender, balance.token, balance.amount);
        }

        tokenIds = new uint256[](params.length);

        for (uint256 i; i < params.length; i++) {
            MintParams memory param = params[i];

            (uint256 tokenId,,) = _mint(param);
            tokenIds[i] = tokenId;
        }
    }

    function _collect(uint256 tokenId) internal returns (uint256 amount0, uint256 amount1) {
        (amount0, amount1) = nftPositionManager.collect(
            INonfungiblePositionManager.CollectParams({
                tokenId: tokenId,
                recipient: msg.sender,
                amount0Max: type(uint128).max,
                amount1Max: type(uint128).max
            })
        );
        emit Collected(tokenId, amount0, amount1);
    }

    function _collectAndClose(CollectParams[] calldata params) internal {
        for (uint256 i; i < params.length; i++) {
            CollectParams memory param = params[i];

            if (param.shouldClose) {
                _removeAllLiquidity(
                    param.tokenId, 
                    param.amount0Min, 
                    param.amount1Min, 
                    param.deadline
                );
            }

            _collect(param.tokenId);

            if (param.shouldBurn) {
                nftPositionManager.burn(param.tokenId);
            }
        }
    }

    function _removeAllLiquidity(
        uint256 tokenId, 
        uint256 amount0Min, 
        uint256 amount1Min, 
        uint256 deadline
    ) internal returns (uint256 amount0, uint256 amount1) {
         (,,,,,,,uint128 liquidity,,,,) = nftPositionManager.positions(tokenId);
         
        (amount0, amount1) = nftPositionManager.decreaseLiquidity(
            INonfungiblePositionManager.DecreaseLiquidityParams({
                tokenId: tokenId,
                liquidity: liquidity,
                amount0Min: amount0Min,
                amount1Min: amount1Min,
                deadline: deadline
            })
        );
        emit Closed(tokenId, amount0, amount1);
    }

    function _mint(MintParams memory param) internal 
        returns (uint256 tokenId, uint256 amount0, uint256 amount1) {
        (tokenId,, amount0, amount1) = nftPositionManager.mint(
            INonfungiblePositionManager.MintParams({
                token0: param.token0,
                token1: param.token1,
                fee: param.fee,
                tickLower: param.tickLower,
                tickUpper: param.tickUpper,
                amount0Desired: param.amount0Desired,
                amount1Desired: param.amount1Desired,
                amount0Min: param.amount0Min,
                amount1Min: param.amount1Min,
                recipient: msg.sender,
                deadline: param.deadline
            })
        );

        // If price slipped, send dust back
        if (amount0 < param.amount0Desired) {
            IERC20(param.token0).safeTransfer(msg.sender, param.amount0Desired - amount0);
        }
        if (amount1 < param.amount1Desired) {
            IERC20(param.token1).safeTransfer(msg.sender, param.amount1Desired - amount1);
        }

        emit Minted(tokenId);
    }

    function _transferFrom(address usr, address token, uint256 amount) internal {
        IERC20(token).safeTransferFrom(usr, address(this), amount);
    }

    function _approve(address token) internal {
        if (_allowances[token] != 1) {
            IERC20(token).safeApprove(address(nftPositionManager), type(uint256).max);
            _allowances[token] = 1;
        }
    }
}
