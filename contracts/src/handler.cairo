//! Unwrap Labs — rewards handler.
//!
//! One instance per `(pool, pool_member, payout, out_token)`.
//!
//! No owner. No admin. No pause. No upgrade. No setters. Every field is written
//! once in the constructor and read forever after. There is no code path in
//! this file that writes storage after deployment.
//!
//! ## Why per-user instances
//!
//! Any balance sitting in this contract belongs to exactly one person. That is
//! what lets every entrypoint be permissionless: `dispatch` needs no accounting
//! and no attribution, because there is only ever one claimant. It also means a
//! manual claim by the delegator — which lands rewards here with no call
//! attached — is not a stuck state. The next dispatch sweeps it, whoever calls.
//!
//! ## What this contract structurally cannot do
//!
//! - **Move principal.** It never calls an exit function, and the pool would
//!   reject it if it did: `exit_delegation_pool_intent` is pool-member-only and
//!   this contract is not the pool member.
//! - **Pay anyone but `payout`.** That address is immutable and is the only
//!   destination that appears anywhere in this file. A different destination
//!   means a different handler at a different address, and only the pool member
//!   can repoint `reward_address` at it.
//!
//! Neither of those is a promise about our conduct. They are properties of the
//! code you can check by reading it.

use starknet::ContractAddress;
use unwrap_staking::interfaces::Route;

/// Everything a caller needs to audit an instance, in one call.
#[derive(Copy, Drop, Serde, PartialEq, Debug)]
pub struct Config {
    pub pool: ContractAddress,
    pub pool_member: ContractAddress,
    pub payout: ContractAddress,
    pub reward_token: ContractAddress,
    pub out_token: ContractAddress,
    pub max_slippage_bps: u16,
    pub pair_in: felt252,
    pub pair_out: felt252,
    pub oracle: ContractAddress,
    pub router: ContractAddress,
}

#[starknet::interface]
pub trait IRewardsHandler<T> {
    /// Permissionless. Pulls unclaimed rewards from the pool into this contract.
    /// Returns the amount claimed. A no-op returning 0 when there is nothing to
    /// claim, or when the pool member no longer exists.
    fn claim(ref self: T) -> u256;

    /// Permissionless. Sends held rewards to `payout`, swapping to `out_token`
    /// first when this is a swapping handler.
    ///
    /// `amount == 0` (or above the held balance) means "everything held".
    /// Smaller amounts let a keeper split a large balance across several
    /// transactions when DEX depth is thin.
    ///
    /// `min_out` may only tighten the floor, never loosen it — see `_floor`.
    /// `routes` is an AVNU route array, as produced by our AVNU wrapper.
    fn dispatch(ref self: T, amount: u256, min_out: u256, routes: Array<Route>);

    /// `claim()` then `dispatch()`. What the keeper runs each epoch.
    fn claim_and_dispatch(ref self: T, amount: u256, min_out: u256, routes: Array<Route>);

    /// Permissionless. Any other token that ends up here — airdrop, mistake,
    /// dust — goes to `payout`. Refuses the reward token, which belongs to the
    /// slippage-checked `dispatch` path or to `escape`.
    fn sweep(ref self: T, token: ContractAddress);

    /// The escape hatch. Sends every reward token held straight to `payout`,
    /// as STRK, with no swap, no oracle and no router.
    ///
    /// This exists so a delegator is never trapped behind infrastructure they
    /// do not control. If Pragma stops publishing, or the router is drained of
    /// liquidity, `dispatch` refuses to run — correctly, because it cannot
    /// price the swap. `escape` is the way out of that: it gives up the
    /// conversion, not the money.
    ///
    /// Unlike everything else here it is **not** permissionless, and that is
    /// deliberate. A permissionless escape would let any caller pre-empt every
    /// dispatch and force STRK on a delegator who asked for Bitcoin. Nothing is
    /// stolen by that, but it overrides a choice that is not the caller's to
    /// make. Restricting it to the delegator removes the option without costing
    /// them anything: `payout` is their address, so they can always call it.
    fn escape(ref self: T);

    // ---- views ----
    fn config(self: @T) -> Config;
    fn held(self: @T) -> u256;
    /// The floor this contract would enforce for `amount`, ignoring any caller
    /// `min_out`. Lets a keeper size a swap before sending it, and lets anyone
    /// verify the slippage bound without a transaction.
    fn floor_for(self: @T, amount: u256) -> u256;
}

#[starknet::contract]
pub mod RewardsHandler {
    use core::num::traits::Zero;
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
    use starknet::{ContractAddress, get_block_timestamp, get_caller_address, get_contract_address};
    use unwrap_staking::interfaces::{
        DataType, IERC20Dispatcher, IERC20DispatcherTrait, IExchangeDispatcher,
        IExchangeDispatcherTrait, IPoolDispatcher, IPoolDispatcherTrait, IPragmaOracleDispatcher,
        IPragmaOracleDispatcherTrait, Route,
    };
    use super::Config;

    /// Oracle sanity bounds. Hardcoded rather than stored, so there is no
    /// deployment of this class — ours or anyone's — that can widen them.
    pub const MAX_SLIPPAGE_CEILING_BPS: u16 = 100; // 1%
    pub const MAX_PRICE_AGE: u64 = 3600; // 1 hour
    pub const MIN_SOURCES: u32 = 3;
    const BPS: u256 = 10000;

    #[storage]
    struct Storage {
        pool: ContractAddress,
        pool_member: ContractAddress,
        payout: ContractAddress,
        reward_token: ContractAddress, // STRK — the pool pays rewards in STRK for BTC pools too
        reward_decimals: u8,
        out_token: ContractAddress, // 0 for a pass-through (STRK) handler
        out_decimals: u8,
        pair_in: felt252, // Pragma pair id, e.g. 'STRK/USD'
        pair_out: felt252, // e.g. 'WBTC/USD'
        oracle: ContractAddress,
        router: ContractAddress,
        max_slippage_bps: u16,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        Claimed: Claimed,
        Dispatched: Dispatched,
        Swept: Swept,
        Escaped: Escaped,
    }

    /// Emitted on every non-zero claim. The frontend reconstructs a delegator's
    /// claim history from these, so no indexer is needed.
    #[derive(Drop, starknet::Event)]
    pub struct Claimed {
        pub amount: u256,
    }

    /// `amount_in` is STRK spent; `amount_out` is what actually reached
    /// `payout`, measured, not reported. For a pass-through handler the two are
    /// equal and `token_out` is STRK.
    #[derive(Drop, starknet::Event)]
    pub struct Dispatched {
        #[key]
        pub token_out: ContractAddress,
        pub amount_in: u256,
        pub amount_out: u256,
    }

    #[derive(Drop, starknet::Event)]
    pub struct Swept {
        #[key]
        pub token: ContractAddress,
        pub amount: u256,
    }

    /// Reward token released to `payout` unswapped, at the delegator's request.
    #[derive(Drop, starknet::Event)]
    pub struct Escaped {
        pub amount: u256,
    }

    pub mod Errors {
        pub const PAYOUT_REQUIRED: felt252 = 'payout required';
        pub const POOL_REQUIRED: felt252 = 'pool required';
        pub const MEMBER_REQUIRED: felt252 = 'member required';
        pub const REWARD_TOKEN_REQUIRED: felt252 = 'reward token required';
        pub const SLIPPAGE_ABOVE_CEILING: felt252 = 'slippage above 1%';
        pub const SWAP_CFG_INCOMPLETE: felt252 = 'swap cfg incomplete';
        pub const PAIR_IDS_REQUIRED: felt252 = 'pair ids required';
        pub const SLIPPAGE_EXCEEDED: felt252 = 'slippage exceeded';
        pub const STALE_PRICE_IN: felt252 = 'stale price in';
        pub const STALE_PRICE_OUT: felt252 = 'stale price out';
        pub const THIN_FEED_IN: felt252 = 'thin feed in';
        pub const THIN_FEED_OUT: felt252 = 'thin feed out';
        pub const BAD_PRICE: felt252 = 'bad price';
        pub const BAD_ROUTE: felt252 = 'bad route';
        pub const SWAP_FAILED: felt252 = 'swap failed';
        pub const USE_DISPATCH: felt252 = 'use dispatch for reward token';
        pub const NOT_A_SWAP_HANDLER: felt252 = 'not a swap handler';
        pub const NOT_THE_DELEGATOR: felt252 = 'only the delegator';
    }

    #[constructor]
    fn constructor(
        ref self: ContractState,
        pool: ContractAddress,
        pool_member: ContractAddress,
        payout: ContractAddress,
        reward_token: ContractAddress,
        reward_decimals: u8,
        out_token: ContractAddress,
        out_decimals: u8,
        pair_in: felt252,
        pair_out: felt252,
        oracle: ContractAddress,
        router: ContractAddress,
        max_slippage_bps: u16,
    ) {
        assert(payout.is_non_zero(), Errors::PAYOUT_REQUIRED);
        assert(pool.is_non_zero(), Errors::POOL_REQUIRED);
        assert(pool_member.is_non_zero(), Errors::MEMBER_REQUIRED);
        assert(reward_token.is_non_zero(), Errors::REWARD_TOKEN_REQUIRED);
        assert(max_slippage_bps <= MAX_SLIPPAGE_CEILING_BPS, Errors::SLIPPAGE_ABOVE_CEILING);

        // A swapping handler needs a complete oracle setup. A pass-through
        // handler needs none, and we do not require one, so a STRK delegator is
        // not exposed to an oracle they have no use for.
        if out_token.is_non_zero() {
            assert(oracle.is_non_zero() && router.is_non_zero(), Errors::SWAP_CFG_INCOMPLETE);
            assert(pair_in != 0 && pair_out != 0, Errors::PAIR_IDS_REQUIRED);
        }

        self.pool.write(pool);
        self.pool_member.write(pool_member);
        self.payout.write(payout);
        self.reward_token.write(reward_token);
        self.reward_decimals.write(reward_decimals);
        self.out_token.write(out_token);
        self.out_decimals.write(out_decimals);
        self.pair_in.write(pair_in);
        self.pair_out.write(pair_out);
        self.oracle.write(oracle);
        self.router.write(router);
        self.max_slippage_bps.write(max_slippage_bps);
    }

    #[abi(embed_v0)]
    impl Handler of super::IRewardsHandler<ContractState> {
        fn claim(ref self: ContractState) -> u256 {
            let pool = IPoolDispatcher { contract_address: self.pool.read() };
            let member = self.pool_member.read();

            // `get_pool_member_info_v1` returns Option rather than reverting on
            // an unknown member, unlike `pool_member_info_v1`. Using it means a
            // keeper tick against a delegator who has fully exited degrades to a
            // no-op instead of reverting — and still falls through to dispatch,
            // which is what clears any balance they left behind.
            let info = match pool.get_pool_member_info_v1(member) {
                Option::Some(i) => i,
                Option::None => { return 0; },
            };

            // The pool does not revert on a zero claim, it just transfers zero.
            // We skip the call anyway: it saves the keeper a pointless external
            // call on every tick where rewards have already been taken.
            if info.unclaimed_rewards == 0 {
                return 0;
            }

            let amount: u256 = pool.claim_rewards(member).into();
            self.emit(Claimed { amount });
            amount
        }

        fn dispatch(ref self: ContractState, amount: u256, min_out: u256, routes: Array<Route>) {
            let strk = self.reward_token.read();
            let held = self._balance(strk);
            let amount_in = if amount == 0 || amount > held {
                held
            } else {
                amount
            };
            if amount_in == 0 {
                return;
            }

            let out_token = self.out_token.read();
            let payout = self.payout.read();

            // Pass-through handler: straight to the delegator. No oracle, no
            // router, no swap, nothing to get wrong.
            if out_token.is_zero() {
                IERC20Dispatcher { contract_address: strk }.transfer(payout, amount_in);
                self.emit(Dispatched { token_out: strk, amount_in, amount_out: amount_in });
                return;
            }

            // Swapping handler. `dispatch` is permissionless, so the caller is
            // untrusted: a hostile keeper could pass `min_out = 0` and sandwich
            // the swap. The contract therefore derives its own floor from
            // Pragma and takes the stricter of the two. A caller may tighten the
            // bound, never loosen it.
            let oracle_floor = self._floor(amount_in);
            let floor = if min_out > oracle_floor {
                min_out
            } else {
                oracle_floor
            };

            // The route is caller-supplied and untrusted, so pin its endpoints.
            // AVNU checks this too; we do not want to depend on it, because a
            // route ending in some other token would swap our STRK away for
            // something the balance delta below reads as zero.
            let len = routes.len();
            assert(len > 0, Errors::BAD_ROUTE);
            assert(*routes[0].token_from == strk, Errors::BAD_ROUTE);
            assert(*routes[len - 1].token_to == out_token, Errors::BAD_ROUTE);

            let router = self.router.read();

            // AVNU asserts `beneficiary == caller`, so this contract must be the
            // beneficiary and forward the proceeds itself. That is not a
            // workaround — it is strictly better for verification, because the
            // amount received is now a delta on our own balance, which no
            // external party can perturb mid-call.
            let before = self._balance(out_token);
            IERC20Dispatcher { contract_address: strk }.approve(router, amount_in);
            let swapped = IExchangeDispatcher { contract_address: router }
                .multi_route_swap(
                    token_from_address: strk,
                    token_from_amount: amount_in,
                    token_to_address: out_token,
                    token_to_amount: floor,
                    token_to_min_amount: floor,
                    beneficiary: get_contract_address(),
                    integrator_fee_amount_bps: 0,
                    integrator_fee_recipient: Zero::zero(),
                    routes: routes,
                );
            assert(swapped, Errors::SWAP_FAILED);
            let received = self._balance(out_token) - before;

            // Belt and braces. We check the measured delta rather than the
            // router's return value, so a router that lies about what it sent
            // still cannot get a bad fill past this line.
            assert(received >= floor, Errors::SLIPPAGE_EXCEEDED);

            // Leave no standing allowance behind. AVNU pulls exactly
            // `amount_in`, so this is normally already zero; setting it
            // explicitly means a router that under-pulls cannot retain one.
            IERC20Dispatcher { contract_address: strk }.approve(router, 0);

            IERC20Dispatcher { contract_address: out_token }.transfer(payout, received);
            self.emit(Dispatched { token_out: out_token, amount_in, amount_out: received });
        }

        fn claim_and_dispatch(
            ref self: ContractState, amount: u256, min_out: u256, routes: Array<Route>,
        ) {
            self.claim();
            self.dispatch(amount, min_out, routes);
        }

        fn sweep(ref self: ContractState, token: ContractAddress) {
            // The reward token is excluded on purpose. Letting it through here
            // would be an unmetered path around the oracle floor that ANY caller
            // could take. Releasing it unswapped is what `escape` is for, and
            // that is restricted to the delegator.
            assert(token != self.reward_token.read(), Errors::USE_DISPATCH);

            let bal = self._balance(token);
            if bal == 0 {
                return;
            }
            IERC20Dispatcher { contract_address: token }.transfer(self.payout.read(), bal);
            self.emit(Swept { token, amount: bal });
        }

        fn escape(ref self: ContractState) {
            let caller = get_caller_address();
            let payout = self.payout.read();
            assert(
                caller == payout || caller == self.pool_member.read(),
                Errors::NOT_THE_DELEGATOR,
            );

            let strk = self.reward_token.read();
            let bal = self._balance(strk);
            if bal == 0 {
                return;
            }
            IERC20Dispatcher { contract_address: strk }.transfer(payout, bal);
            self.emit(Escaped { amount: bal });
        }

        fn config(self: @ContractState) -> Config {
            Config {
                pool: self.pool.read(),
                pool_member: self.pool_member.read(),
                payout: self.payout.read(),
                reward_token: self.reward_token.read(),
                out_token: self.out_token.read(),
                max_slippage_bps: self.max_slippage_bps.read(),
                pair_in: self.pair_in.read(),
                pair_out: self.pair_out.read(),
                oracle: self.oracle.read(),
                router: self.router.read(),
            }
        }

        fn held(self: @ContractState) -> u256 {
            self._balance(self.reward_token.read())
        }

        fn floor_for(self: @ContractState, amount: u256) -> u256 {
            assert(self.out_token.read().is_non_zero(), Errors::NOT_A_SWAP_HANDLER);
            self._floor(amount)
        }
    }

    #[generate_trait]
    impl Internal of InternalTrait {
        /// Minimum acceptable output for `amount_in`, from two Pragma medians:
        ///
        ///     out = in * price_in / price_out, decimal-adjusted, less slippage
        ///
        /// A stale or thin feed is a refusal, not a discount. If we cannot
        /// price the swap we do not do the swap — the rewards simply stay put
        /// and the next tick tries again.
        fn _floor(self: @ContractState, amount_in: u256) -> u256 {
            let oracle = IPragmaOracleDispatcher { contract_address: self.oracle.read() };
            let a = oracle.get_data_median(DataType::SpotEntry(self.pair_in.read()));
            let b = oracle.get_data_median(DataType::SpotEntry(self.pair_out.read()));

            let now = get_block_timestamp();
            // Saturating: a feed timestamped slightly in the future (clock skew
            // between the oracle and the sequencer) reads as age zero rather
            // than underflowing to a huge number and reverting.
            let age_a = if now > a.last_updated_timestamp {
                now - a.last_updated_timestamp
            } else {
                0
            };
            let age_b = if now > b.last_updated_timestamp {
                now - b.last_updated_timestamp
            } else {
                0
            };
            assert(age_a <= MAX_PRICE_AGE, Errors::STALE_PRICE_IN);
            assert(age_b <= MAX_PRICE_AGE, Errors::STALE_PRICE_OUT);
            assert(a.num_sources_aggregated >= MIN_SOURCES, Errors::THIN_FEED_IN);
            assert(b.num_sources_aggregated >= MIN_SOURCES, Errors::THIN_FEED_OUT);
            assert(a.price > 0 && b.price > 0, Errors::BAD_PRICE);

            let fair = amount_in
                * a.price.into()
                * pow10(b.decimals + self.out_decimals.read().into())
                / (b.price.into() * pow10(a.decimals + self.reward_decimals.read().into()));

            fair * (BPS - self.max_slippage_bps.read().into()) / BPS
        }

        fn _balance(self: @ContractState, token: ContractAddress) -> u256 {
            IERC20Dispatcher { contract_address: token }.balance_of(get_contract_address())
        }
    }

    fn pow10(n: u32) -> u256 {
        let mut r: u256 = 1;
        let mut i: u32 = 0;
        while i < n {
            r = r * 10;
            i += 1;
        }
        r
    }
}
