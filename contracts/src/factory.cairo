//! Unwrap Labs — rewards handler factory.
//!
//! The factory exists for one reason: to make a handler's address derivable
//! *before* it exists, so a delegator can point `reward_address` at it and opt
//! in with a single transaction from their own wallet, before anything has been
//! deployed.
//!
//! It holds no funds, has no owner, and cannot upgrade or reconfigure anything.
//! The class hash, the shared addresses and the supported-token table are fixed
//! at construction. To change handler code or add a token we deploy a *new*
//! factory; existing handlers are untouched and keep working, because nothing
//! points at us after deployment.
//!
//! ## Two things the factory deliberately owns
//!
//! **The swap configuration.** `strk`, `oracle`, `router`, the STRK pair id and
//! `MAX_SLIPPAGE_BPS` are supplied by the factory, never by the caller. Nor is
//! the out-token's decimals or Pragma pair id caller-supplied: those come from
//! an immutable table keyed by token address. Otherwise someone could deploy a
//! handler pointed at a thin or wrong price feed — making its oracle floor
//! meaninglessly low — and still land on an address this factory produces.
//!
//! **A subscription index.** `deploy_handler` records every handler it creates,
//! by global index and by pool member, so the keeper can enumerate active
//! subscriptions by reading chain state alone. No indexer, no database.
//!
//! To be explicit, because it is the obvious thing to worry about: this index
//! grants nothing. It is a list. Authority to claim comes only from the pool's
//! own `reward_address`, which only the delegator can set. A handler in this
//! list whose delegator has since repointed `reward_address` elsewhere is
//! simply inert, and the keeper treats it as unsubscribed.

use starknet::{ClassHash, ContractAddress};

/// An out-token the factory will build handlers for.
///
/// `pair` is the Pragma spot pair id used for that token's leg of the price
/// floor. Fixing it here — rather than accepting it per deployment — is what
/// stops a handler existing with a plausible address and a useless feed.
#[derive(Copy, Drop, Serde, starknet::Store, PartialEq, Debug)]
pub struct TokenConfig {
    pub token: ContractAddress,
    pub decimals: u8,
    pub pair: felt252,
}

/// One deployed handler. The keeper reads these and checks each against the
/// pool's current `reward_address` to decide whether it is still live.
#[derive(Copy, Drop, Serde, starknet::Store, PartialEq, Debug)]
pub struct Subscription {
    pub handler: ContractAddress,
    pub pool: ContractAddress,
    pub pool_member: ContractAddress,
    pub payout: ContractAddress,
    /// Zero for a pass-through STRK handler.
    pub out_token: ContractAddress,
}

#[starknet::interface]
pub trait IHandlerFactory<T> {
    /// Permissionless. Deploys the handler for this exact configuration.
    ///
    /// Deploying costs the caller gas and benefits only `payout`, so there is
    /// nothing to grief: the same arguments always produce the same address,
    /// and a handler deployed by a stranger is the same handler.
    ///
    /// `out_token` must be zero (pass-through STRK) or a registered token.
    fn deploy_handler(
        ref self: T,
        pool: ContractAddress,
        pool_member: ContractAddress,
        payout: ContractAddress,
        out_token: ContractAddress,
    ) -> ContractAddress;

    /// The address `deploy_handler` will produce for these arguments.
    /// Call this first, set it as your reward address, deploy whenever.
    fn handler_address(
        self: @T,
        pool: ContractAddress,
        pool_member: ContractAddress,
        payout: ContractAddress,
        out_token: ContractAddress,
    ) -> ContractAddress;

    // ---- immutable configuration ----
    fn handler_class_hash(self: @T) -> ClassHash;
    fn reward_token(self: @T) -> ContractAddress;
    fn oracle(self: @T) -> ContractAddress;
    fn router(self: @T) -> ContractAddress;
    fn max_slippage_bps(self: @T) -> u16;
    /// Zero `decimals`/`pair` means the token is not registered.
    fn token_config(self: @T, token: ContractAddress) -> TokenConfig;
    fn supported_tokens(self: @T) -> Array<TokenConfig>;

    // ---- subscription index ----
    fn subscriptions_count(self: @T) -> u64;
    fn subscription_at(self: @T, index: u64) -> Subscription;
    /// A page of the global index. `start` is inclusive; the result is clamped
    /// to the end of the list, so a keeper can walk it without knowing the
    /// count up front.
    fn subscriptions(self: @T, start: u64, limit: u64) -> Array<Subscription>;
    /// Every handler deployed for `pool_member`. The same delegator can stake
    /// several assets, so this is a list, not a single entry.
    fn subscriptions_of(self: @T, pool_member: ContractAddress) -> Array<Subscription>;
    fn is_handler(self: @T, handler: ContractAddress) -> bool;
}

#[starknet::contract]
pub mod HandlerFactory {
    use core::num::traits::Zero;
    use core::poseidon::poseidon_hash_span;
    use starknet::storage::{
        Map, StoragePathEntry, StoragePointerReadAccess, StoragePointerWriteAccess,
    };
    use starknet::syscalls::deploy_syscall;
    use starknet::{ClassHash, ContractAddress};
    use unwrap_staking::utils::calculate_contract_address;
    use super::{Subscription, TokenConfig};

    /// 1%, applied to every handler this factory builds. Not stored, not
    /// configurable, not passed in.
    pub const MAX_SLIPPAGE_BPS: u16 = 100;

    #[storage]
    struct Storage {
        handler_class_hash: ClassHash,
        strk: ContractAddress,
        strk_decimals: u8,
        pair_in: felt252, // 'STRK/USD'
        oracle: ContractAddress, // Pragma
        router: ContractAddress, // AVNU exchange
        // immutable out-token table
        token_count: u32,
        token_at: Map<u32, ContractAddress>,
        tokens: Map<ContractAddress, TokenConfig>,
        // subscription index
        subs_count: u64,
        subs: Map<u64, Subscription>,
        member_count: Map<ContractAddress, u64>,
        member_sub: Map<(ContractAddress, u64), u64>,
        is_handler: Map<ContractAddress, bool>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        HandlerDeployed: HandlerDeployed,
    }

    /// The frontend and the keeper both read their world from this event plus
    /// the index below it. `index` is the position in the global list.
    #[derive(Drop, starknet::Event)]
    pub struct HandlerDeployed {
        #[key]
        pub pool_member: ContractAddress,
        #[key]
        pub pool: ContractAddress,
        #[key]
        pub handler: ContractAddress,
        pub payout: ContractAddress,
        pub out_token: ContractAddress,
        pub index: u64,
    }

    pub mod Errors {
        pub const CLASS_HASH_REQUIRED: felt252 = 'class hash required';
        pub const STRK_REQUIRED: felt252 = 'strk required';
        pub const PAIR_IN_REQUIRED: felt252 = 'pair in required';
        pub const ORACLE_REQUIRED: felt252 = 'oracle required';
        pub const ROUTER_REQUIRED: felt252 = 'router required';
        pub const TOKEN_NOT_SUPPORTED: felt252 = 'token not supported';
        pub const BAD_TOKEN_CONFIG: felt252 = 'bad token config';
        pub const DUPLICATE_TOKEN: felt252 = 'duplicate token';
        pub const INDEX_OUT_OF_RANGE: felt252 = 'index out of range';
        pub const DEPLOY_FAILED: felt252 = 'deploy failed';
    }

    #[constructor]
    fn constructor(
        ref self: ContractState,
        handler_class_hash: ClassHash,
        strk: ContractAddress,
        strk_decimals: u8,
        pair_in: felt252,
        oracle: ContractAddress,
        router: ContractAddress,
        tokens: Array<TokenConfig>,
    ) {
        assert(handler_class_hash.is_non_zero(), Errors::CLASS_HASH_REQUIRED);
        assert(strk.is_non_zero(), Errors::STRK_REQUIRED);
        assert(pair_in != 0, Errors::PAIR_IN_REQUIRED);
        assert(oracle.is_non_zero(), Errors::ORACLE_REQUIRED);
        assert(router.is_non_zero(), Errors::ROUTER_REQUIRED);

        self.handler_class_hash.write(handler_class_hash);
        self.strk.write(strk);
        self.strk_decimals.write(strk_decimals);
        self.pair_in.write(pair_in);
        self.oracle.write(oracle);
        self.router.write(router);

        let mut i: u32 = 0;
        let n = tokens.len();
        while i < n {
            let cfg = *tokens[i];
            assert(cfg.token.is_non_zero() && cfg.pair != 0, Errors::BAD_TOKEN_CONFIG);
            assert(self.tokens.entry(cfg.token).read().pair == 0, Errors::DUPLICATE_TOKEN);
            self.tokens.entry(cfg.token).write(cfg);
            self.token_at.entry(i).write(cfg.token);
            i += 1;
        }
        self.token_count.write(n);
    }

    #[abi(embed_v0)]
    impl Factory of super::IHandlerFactory<ContractState> {
        fn deploy_handler(
            ref self: ContractState,
            pool: ContractAddress,
            pool_member: ContractAddress,
            payout: ContractAddress,
            out_token: ContractAddress,
        ) -> ContractAddress {
            let calldata = self._calldata(pool, pool_member, payout, out_token);

            // `deploy_from_zero: true` — the address depends only on the class
            // hash, the salt and the calldata, not on this factory. Anyone can
            // rederive it without trusting us, and a future factory produces
            // identical addresses for identical arguments.
            //
            // A second call with identical arguments reverts here, because the
            // address is already occupied. That is the intended behaviour: it
            // is also what makes the index below duplicate-free without a check.
            let (handler, _) = deploy_syscall(
                self.handler_class_hash.read(),
                self._salt(pool, pool_member, payout, out_token),
                calldata.span(),
                true,
            )
                .expect(Errors::DEPLOY_FAILED);

            let index = self.subs_count.read();
            let sub = Subscription { handler, pool, pool_member, payout, out_token };
            self.subs.entry(index).write(sub);
            self.subs_count.write(index + 1);

            let m = self.member_count.entry(pool_member).read();
            self.member_sub.entry((pool_member, m)).write(index);
            self.member_count.entry(pool_member).write(m + 1);

            self.is_handler.entry(handler).write(true);

            self.emit(HandlerDeployed { pool_member, pool, handler, payout, out_token, index });
            handler
        }

        fn handler_address(
            self: @ContractState,
            pool: ContractAddress,
            pool_member: ContractAddress,
            payout: ContractAddress,
            out_token: ContractAddress,
        ) -> ContractAddress {
            let calldata = self._calldata(pool, pool_member, payout, out_token);
            calculate_contract_address(
                self._salt(pool, pool_member, payout, out_token),
                self.handler_class_hash.read(),
                calldata.span(),
                Zero::zero() // deployer 0, matching deploy_from_zero: true
            )
        }

        fn handler_class_hash(self: @ContractState) -> ClassHash {
            self.handler_class_hash.read()
        }

        fn reward_token(self: @ContractState) -> ContractAddress {
            self.strk.read()
        }

        fn oracle(self: @ContractState) -> ContractAddress {
            self.oracle.read()
        }

        fn router(self: @ContractState) -> ContractAddress {
            self.router.read()
        }

        fn max_slippage_bps(self: @ContractState) -> u16 {
            MAX_SLIPPAGE_BPS
        }

        fn token_config(self: @ContractState, token: ContractAddress) -> TokenConfig {
            self.tokens.entry(token).read()
        }

        fn supported_tokens(self: @ContractState) -> Array<TokenConfig> {
            let mut out = array![];
            let n = self.token_count.read();
            let mut i: u32 = 0;
            while i < n {
                out.append(self.tokens.entry(self.token_at.entry(i).read()).read());
                i += 1;
            }
            out
        }

        fn subscriptions_count(self: @ContractState) -> u64 {
            self.subs_count.read()
        }

        fn subscription_at(self: @ContractState, index: u64) -> Subscription {
            assert(index < self.subs_count.read(), Errors::INDEX_OUT_OF_RANGE);
            self.subs.entry(index).read()
        }

        fn subscriptions(self: @ContractState, start: u64, limit: u64) -> Array<Subscription> {
            let total = self.subs_count.read();
            let mut out = array![];
            if start >= total {
                return out;
            }
            let end = if start + limit > total {
                total
            } else {
                start + limit
            };
            let mut i = start;
            while i < end {
                out.append(self.subs.entry(i).read());
                i += 1;
            }
            out
        }

        fn subscriptions_of(
            self: @ContractState, pool_member: ContractAddress,
        ) -> Array<Subscription> {
            let n = self.member_count.entry(pool_member).read();
            let mut out = array![];
            let mut i: u64 = 0;
            while i < n {
                let global = self.member_sub.entry((pool_member, i)).read();
                out.append(self.subs.entry(global).read());
                i += 1;
            }
            out
        }

        fn is_handler(self: @ContractState, handler: ContractAddress) -> bool {
            self.is_handler.entry(handler).read()
        }
    }

    #[generate_trait]
    impl Internal of InternalTrait {
        fn _salt(
            self: @ContractState,
            pool: ContractAddress,
            pool_member: ContractAddress,
            payout: ContractAddress,
            out_token: ContractAddress,
        ) -> felt252 {
            poseidon_hash_span(
                array![pool.into(), pool_member.into(), payout.into(), out_token.into()].span(),
            )
        }

        /// Constructor calldata for the handler. Everything security-relevant
        /// here is read from factory storage, not from the caller — see the
        /// module docs.
        fn _calldata(
            self: @ContractState,
            pool: ContractAddress,
            pool_member: ContractAddress,
            payout: ContractAddress,
            out_token: ContractAddress,
        ) -> Array<felt252> {
            // A zero out-token is the pass-through STRK handler and needs no
            // feed. Anything else must be in the immutable table.
            let (out_decimals, pair_out) = if out_token.is_zero() {
                (0_u8, 0)
            } else {
                let cfg = self.tokens.entry(out_token).read();
                assert(cfg.pair != 0, Errors::TOKEN_NOT_SUPPORTED);
                (cfg.decimals, cfg.pair)
            };

            array![
                pool.into(),
                pool_member.into(),
                payout.into(),
                self.strk.read().into(),
                self.strk_decimals.read().into(),
                out_token.into(),
                out_decimals.into(),
                self.pair_in.read(),
                pair_out,
                self.oracle.read().into(),
                self.router.read().into(),
                MAX_SLIPPAGE_BPS.into(),
            ]
        }
    }
}

// ---------------------------------------------------------------------------
// Opt in, end to end. One signature from the delegator, and it is theirs to undo.
//
//   1. handler = factory.handler_address(pool, me, my_payout, wbtc)
//   2. pool.change_reward_address(handler)   <- only the pool member can call
//   3. factory.deploy_handler(...)           <- us, or anyone, any time after
//   4. keeper: handler.claim_and_dispatch(0, 0, routes) each epoch
//
// Opt out: pool.change_reward_address(my_own_address). Nothing to ask us for,
// and the keeper stops on its own the moment it reads the new reward address.
// ---------------------------------------------------------------------------
