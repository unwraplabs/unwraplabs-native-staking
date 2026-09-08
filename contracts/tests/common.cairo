//! Shared fixture.
//!
//! Prices are realistic on purpose, so the numbers in the assertions are ones
//! you can check by hand: STRK at $0.15, BTC at $115,000. 1000 STRK is $150,
//! which is 130,434 sats.

use snforge_std::{ContractClassTrait, DeclareResultTrait, declare};
use starknet::{ClassHash, ContractAddress};
use unwrap_staking::factory::{
    IHandlerFactoryDispatcher, TokenConfig,
};
use unwrap_staking::mocks::erc20::{IMockERC20Dispatcher, IMockERC20DispatcherTrait};
use unwrap_staking::mocks::oracle::{IMockOracleAdminDispatcher, IMockOracleAdminDispatcherTrait};
use unwrap_staking::mocks::pool::{IMockPoolAdminDispatcher, IMockPoolAdminDispatcherTrait};
use unwrap_staking::mocks::router::{IMockRouterAdminDispatcher, IMockRouterAdminDispatcherTrait};

pub const STRK_USD: felt252 = 'STRK/USD';
pub const WBTC_USD: felt252 = 'WBTC/USD';

/// $0.15 with 8 oracle decimals.
pub const STRK_PRICE: u128 = 15000000;
/// $115,000 with 8 oracle decimals.
pub const BTC_PRICE: u128 = 11500000000000;
pub const ORACLE_DECIMALS: u32 = 8;
pub const NOW: u64 = 1_000_000;

/// 1000 STRK.
pub const ONE_K_STRK: u256 = 1000_000000000000000000;
/// What 1000 STRK is worth at the fixture prices, in sats.
pub const FAIR_SATS: u256 = 130434;
/// `FAIR_SATS` less 1% slippage.
pub const FLOOR_SATS: u256 = 129129;

#[derive(Copy, Drop)]
pub struct Env {
    pub strk: ContractAddress,
    pub wbtc: ContractAddress,
    pub other: ContractAddress,
    pub pool: ContractAddress,
    pub oracle: ContractAddress,
    pub router: ContractAddress,
    pub factory: IHandlerFactoryDispatcher,
    pub handler_class: ClassHash,
}

pub fn member() -> ContractAddress {
    'member'.try_into().unwrap()
}

pub fn payout() -> ContractAddress {
    'payout'.try_into().unwrap()
}

pub fn stranger() -> ContractAddress {
    'stranger'.try_into().unwrap()
}

fn deploy(name: ByteArray, args: Array<felt252>) -> ContractAddress {
    let contract = declare(name).unwrap().contract_class();
    let (addr, _) = contract.deploy(@args).unwrap();
    addr
}

pub fn setup() -> Env {
    let strk = deploy("MockERC20", array![]);
    let wbtc = deploy("MockERC20", array![]);
    let other = deploy("MockERC20", array![]);
    let pool = deploy("MockPool", array![strk.into()]);
    let oracle = deploy("MockOracle", array![]);

    // Rate chosen so 1000 STRK in yields exactly FAIR_SATS out.
    let router = deploy("MockRouter", array![FAIR_SATS.low.into(), 0, ONE_K_STRK.low.into(), ONE_K_STRK.high.into()]);

    let admin = IMockOracleAdminDispatcher { contract_address: oracle };
    admin.set_median(STRK_USD, STRK_PRICE, ORACLE_DECIMALS, NOW, 5);
    admin.set_median(WBTC_USD, BTC_PRICE, ORACLE_DECIMALS, NOW, 5);

    let handler_class = *declare("RewardsHandler").unwrap().contract_class().class_hash;

    let tokens = array![TokenConfig { token: wbtc, decimals: 8, pair: WBTC_USD }];
    let mut factory_args: Array<felt252> = array![
        handler_class.into(), strk.into(), 18, STRK_USD, oracle.into(), router.into(),
    ];
    tokens.serialize(ref factory_args);
    let factory = deploy("HandlerFactory", factory_args);

    // The pool needs STRK on hand to pay claims; the router needs WBTC to fill.
    IMockERC20Dispatcher { contract_address: strk }.mint(pool, 10_000_000_000000000000000000);
    IMockERC20Dispatcher { contract_address: wbtc }.mint(router, 100_000000000);

    Env {
        strk,
        wbtc,
        other,
        pool,
        oracle,
        router,
        factory: IHandlerFactoryDispatcher { contract_address: factory },
        handler_class,
    }
}

/// Registers `member` in the mock pool with `handler` as their reward address —
/// the on-chain state that opting in produces.
pub fn subscribe(env: Env, handler: ContractAddress, unclaimed: u128) {
    IMockPoolAdminDispatcher { contract_address: env.pool }
        .set_member(member(), handler, 5_000_000000000000000000, unclaimed);
}

pub fn set_rate(env: Env, numerator: u256, denominator: u256) {
    IMockRouterAdminDispatcher { contract_address: env.router }.set_rate(numerator, denominator);
}

pub fn balance(token: ContractAddress, who: ContractAddress) -> u256 {
    IMockERC20Dispatcher { contract_address: token }.balance_of(who)
}

pub fn mint(token: ContractAddress, to: ContractAddress, amount: u256) {
    IMockERC20Dispatcher { contract_address: token }.mint(to, amount);
}

/// A one-hop STRK -> `to` route, the shape AVNU's API returns for a direct pair.
pub fn route(from: ContractAddress, to: ContractAddress) -> Array<unwrap_staking::interfaces::Route> {
    array![
        unwrap_staking::interfaces::Route {
            token_from: from,
            token_to: to,
            exchange_address: 'ekubo'.try_into().unwrap(),
            percent: 1000000000000,
            additional_swap_params: array![],
        },
    ]
}
