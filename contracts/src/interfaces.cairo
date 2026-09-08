//! External interfaces the handler talks to.
//!
//! Every signature here was transcribed from the deployed source, not from
//! documentation. Where the upstream type differs from what you might assume,
//! the difference is called out in a comment, because getting one of these
//! wrong is the difference between a working keeper and a bricked handler.

use starknet::ContractAddress;

// ---------------------------------------------------------------------------
// Starknet staking pool
// starkware-libs/starknet-staking : src/pool/interface.cairo
//
// `Amount` is u128 upstream (src/types.cairo), NOT u256. `Commission` is u16.
// We mirror those widths exactly so the ABI matches on the wire.
// ---------------------------------------------------------------------------

pub type Amount = u128;
pub type Commission = u16;

/// Mirror of `staking::pool::interface::PoolMemberInfoV1`.
///
/// Field order is load-bearing — it is the deserialisation order of the real
/// contract's return value.
#[derive(Copy, Debug, Drop, PartialEq, Serde)]
pub struct PoolMemberInfoV1 {
    pub reward_address: ContractAddress,
    pub amount: Amount,
    pub unclaimed_rewards: Amount,
    pub commission: Commission,
    pub unpool_amount: Amount,
    pub unpool_time: Option<u64>,
}

#[starknet::interface]
pub trait IPool<T> {
    /// Transfers `pool_member`'s accrued rewards to their `reward_address` and
    /// returns the amount sent.
    ///
    /// Access control, verified in `pool.cairo`:
    ///     caller == pool_member || caller == reward_address
    ///
    /// So a contract installed as the reward address is already authorised.
    /// There is nothing for us to be granted and nothing for us to revoke.
    ///
    /// It does NOT revert on zero rewards — it transfers zero and emits. It
    /// DOES revert if `pool_member` is not a member of this pool, which is the
    /// case the handler actually has to defend against.
    fn claim_rewards(ref self: T, pool_member: ContractAddress) -> Amount;

    /// Access control: pool member only. This is what makes opting in and out
    /// the delegator's decision alone, and why the handler needs no off switch.
    fn change_reward_address(ref self: T, reward_address: ContractAddress);

    /// Returns `None` instead of reverting when `pool_member` is not a member.
    /// The handler uses this rather than `pool_member_info_v1` so that a keeper
    /// tick against a stale subscription degrades to a no-op instead of
    /// reverting the whole batch.
    fn get_pool_member_info_v1(
        self: @T, pool_member: ContractAddress,
    ) -> Option<PoolMemberInfoV1>;
}

// ---------------------------------------------------------------------------
// ERC20
// ---------------------------------------------------------------------------

#[starknet::interface]
pub trait IERC20<T> {
    fn balance_of(self: @T, account: ContractAddress) -> u256;
    fn transfer(ref self: T, recipient: ContractAddress, amount: u256) -> bool;
    fn approve(ref self: T, spender: ContractAddress, amount: u256) -> bool;
}

// ---------------------------------------------------------------------------
// Pragma oracle
// astraly-labs/pragma-oracle : pragma-oracle/src/entry/structs.cairo
//
// Note `decimals` and `num_sources_aggregated` are u32, not u8/felt.
// ---------------------------------------------------------------------------

#[derive(Copy, Drop, Serde)]
pub enum DataType {
    SpotEntry: felt252,
    FutureEntry: (felt252, u64),
    GenericEntry: felt252,
}

#[derive(Copy, Drop, Serde)]
pub struct PragmaPricesResponse {
    pub price: u128,
    pub decimals: u32,
    pub last_updated_timestamp: u64,
    pub num_sources_aggregated: u32,
    pub expiration_timestamp: Option<u64>,
}

#[starknet::interface]
pub trait IPragmaOracle<T> {
    fn get_data_median(self: @T, data_type: DataType) -> PragmaPricesResponse;
}

// ---------------------------------------------------------------------------
// AVNU exchange
// avnu-labs/avnu-contracts-v2 : src/exchange.cairo
//
// Two properties of this contract shape the handler's dispatch path:
//
//   1. `before_swap` asserts `beneficiary == caller_address`. The handler
//      therefore CANNOT name the payout address as beneficiary — it must
//      receive the bought token itself and forward it. This is why dispatch
//      measures its own balance delta rather than the payout's.
//
//   2. The exchange sends `buy_token.balanceOf(exchange)` to the beneficiary,
//      so the handler receives the entire output of the swap.
//
// `Route` here is the flat encoding. Upstream has since wrapped the swap
// fields in a `RouteSwap` enum, but that enum's `Direct` variant serialises to
// exactly these felts in exactly this order — the enum is explicitly
// retrocompatible with the original one-variant encoding. Staying flat keeps
// this contract small and matches the route arrays our own AVNU wrapper
// already produces. Branch routes are not expressible, and we do not use them.
// ---------------------------------------------------------------------------

#[derive(Drop, Clone, Serde)]
pub struct Route {
    pub token_from: ContractAddress,
    pub token_to: ContractAddress,
    pub exchange_address: ContractAddress,
    pub percent: u128,
    pub additional_swap_params: Array<felt252>,
}

#[starknet::interface]
pub trait IExchange<T> {
    fn multi_route_swap(
        ref self: T,
        token_from_address: ContractAddress,
        token_from_amount: u256,
        token_to_address: ContractAddress,
        token_to_amount: u256,
        token_to_min_amount: u256,
        beneficiary: ContractAddress,
        integrator_fee_amount_bps: u128,
        integrator_fee_recipient: ContractAddress,
        routes: Array<Route>,
    ) -> bool;
}
