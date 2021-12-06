// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

interface IUniswapV3Batcher {

    event Minted(uint256 tokenId);

    event Collected(uint256 tokenId, uint256 amount0, uint256 amount1);

    event Closed(uint256 tokenId, uint256 amount0, uint256 amount1);

    event FeeSet(uint256 oldFee, uint256 newFee);

    /// @notice Collect fees from owned NFTs
    /// @dev Call this to save gas on collecting from LPs individually. Note that this contract has to
    /// be approved by `msg.sender` preferably using `setApprovalForAll`
    /// @param tokenIds The ids of the tokens to collect fees from
    function collect(uint256[] calldata tokenIds) external payable;

    struct CollectParams {
        uint256 tokenId;
        uint256 amount0Min;
        uint256 amount1Min;
        uint256 deadline;
        bool shouldClose;
        bool shouldBurn;
    }

    /// @notice Removes all liquidity, and collects owed fees
    /// @dev Call this to close multiple LPs of all liquidity. Is more efficient than closing one LP at a time
    /// and NFTs can be burnt if necessary. Note that this contract has to
    /// be approved by `msg.sender` preferably using `setApprovalForAll`
    /// @param params The ids of the tokens with slippage tolerances encoded as `CollectParams` calldata
    function collectAndClose(CollectParams[] calldata params) external payable;

    struct MintParams {
        address token0;
        address token1;
        uint24 fee;
        int24 tickLower;
        int24 tickUpper;
        uint256 deadline;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
    }

    struct BalanceParams {
        address token;
        uint256 amount;
    }

    /// @notice Mints a new NFT position
    /// @dev Call this to open multiple LPs on various pools. Is more efficient than opening one LP at a time
    /// Note that this contract must be approved for all tokens by `msg.sender` and all minted positions
    /// are created with the recipient to be `msg.sender`
    /// @param params The params necessary to open positions encoded as `MintParams` in calldata
    /// @param balances The balances necessary of each token to mint the positions encoded as `BalanceParams` in calldata
    /// @return tokenIds The NF token Ids of the minted positions
    function mint(MintParams[] calldata params, BalanceParams[] calldata balances) external payable returns (uint256[] memory tokenIds);

    /// @notice Helper function to close and mint new LP
    /// @dev Call this to close multiple LPs, then open multiple LPs on various pools. Is more efficient than closeing/opening one LP at a time
    /// Note that this contract must be approved for all tokens by `msg.sender` and all minted positions
    /// are created with the recipient to be `msg.sender`. NFTs need to be approved for `msg.sender` preferably using `setApprovalForAll`
    /// @param mintParams The params necessary to open positions encoded as `MintParams` in calldata
    /// @param balances The balances necessary of each token to mint the positions encoded as `BalanceParams` in calldata
    /// @param collectParams The tokens to close the position encoded as `CollectParams` in calldata
    /// @return tokenIds The NF token Ids of the newly minted positions
    function rerange(MintParams[] calldata mintParams, BalanceParams[] calldata balances, CollectParams[] calldata collectParams) external payable returns (uint256[] memory tokenIds);

    /// @notice Sets base fee for using manager
    /// @dev Has onlyOwner modifier
    /// @param newFee New fee to set denominated in wei
    function setFee(uint256 newFee) external;

    /// @notice Withdraws fees to address
    /// @dev Has onlyOwner modifier
    /// @param usr Address to send ETH
    function withdraw(address usr) external;
    
}