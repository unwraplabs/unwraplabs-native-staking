//! The one real trust surface.
//!
//! `dispatch` is permissionless, so its caller is untrusted. These tests pin
//! down the property that makes that safe: the contract derives its own price
//! floor, and a caller can only tighten it.

use snforge_std::start_cheat_block_timestamp_global;
use unwrap_staking::factory::IHandlerFactoryDispatcherTrait;
use unwrap_staking::handler::{IRewardsHandlerDispatcher, IRewardsHandlerDispatcherTrait};
use unwrap_staking::mocks::oracle::{IMockOracleAdminDispatcher, IMockOracleAdminDispatcherTrait};
use unwrap_staking::mocks::router::{IMockRouterAdminDispatcher, IMockRouterAdminDispatcherTrait};
use super::common::{
    BTC_PRICE, Env, FAIR_SATS, FLOOR_SATS, NOW, ONE_K_STRK, ORACLE_DECIMALS, STRK_PRICE, STRK_USD,
    WBTC_USD, balance, member, mint, payout, route, set_rate, setup, subscribe,
};

/// A swapping handler holding 1000 STRK, with the clock set so the fixture
/// feeds are fresh.
fn btc_handler(env: Env) -> IRewardsHandlerDispatcher {
    start_cheat_block_timestamp_global(NOW);
    let addr = env.factory.deploy_handler(env.pool, member(), payout(), env.wbtc);
    subscribe(env, addr, 0);
    mint(env.strk, addr, ONE_K_STRK);
    IRewardsHandlerDispatcher { contract_address: addr }
}

fn set_median(env: Env, pair: felt252, price: u128, last_updated: u64, sources: u32) {
    IMockOracleAdminDispatcher { contract_address: env.oracle }
        .set_median(pair, price, ORACLE_DECIMALS, last_updated, sources);
}

// ---------------------------------------------------------------------------
// The floor itself
// ---------------------------------------------------------------------------

#[test]
fn test_floor_is_fair_value_less_one_percent() {
    let env = setup();
    let handler = btc_handler(env);
    // 1000 STRK at $0.15 is $150; at $115,000/BTC that is 130,434 sats.
    assert!(handler.floor_for(ONE_K_STRK) == FLOOR_SATS, "floor is fair value less 1%");
}

#[test]
#[should_panic(expected: 'not a swap handler')]
fn test_floor_is_meaningless_for_a_passthrough_handler() {
    let env = setup();
    let addr = env.factory.deploy_handler(env.pool, member(), payout(), 0.try_into().unwrap());
    IRewardsHandlerDispatcher { contract_address: addr }.floor_for(ONE_K_STRK);
}

#[test]
fn test_a_good_fill_reaches_the_delegator_as_btc() {
    let env = setup();
    let handler = btc_handler(env);

    handler.dispatch(0, 0, route(env.strk, env.wbtc));

    assert!(balance(env.wbtc, payout()) == FAIR_SATS, "the delegator is paid in BTC");
    assert!(handler.held() == 0, "no STRK left behind");
    assert!(balance(env.wbtc, handler.contract_address) == 0, "and no BTC left behind either");
}

// ---------------------------------------------------------------------------
// A hostile caller
// ---------------------------------------------------------------------------

#[test]
#[should_panic(expected: 'Insufficient tokens received')]
fn test_min_out_zero_still_gets_the_oracle_floor() {
    let env = setup();
    let handler = btc_handler(env);
    // A caller trying to sandwich: pass min_out = 0 and route to a bad fill.
    // The router still receives the oracle floor, because the handler — not the
    // caller — chose the number it sent.
    set_rate(env, 100000, ONE_K_STRK);
    handler.dispatch(0, 0, route(env.strk, env.wbtc));
}

#[test]
#[should_panic(expected: 'slippage exceeded')]
fn test_a_lying_router_is_caught_by_the_measured_delta() {
    let env = setup();
    let handler = btc_handler(env);
    // Router reports success but under-delivers. The handler checks its own
    // balance delta rather than the router's word, so this still fails.
    IMockRouterAdminDispatcher { contract_address: env.router }.set_skip_min_check(true);
    set_rate(env, 100000, ONE_K_STRK);
    handler.dispatch(0, 0, route(env.strk, env.wbtc));
}

#[test]
#[should_panic(expected: 'Insufficient tokens received')]
fn test_a_caller_may_tighten_the_floor() {
    let env = setup();
    let handler = btc_handler(env);
    // The fill would clear the oracle floor, but this caller demanded more.
    handler.dispatch(0, FAIR_SATS + 1000, route(env.strk, env.wbtc));
}

#[test]
fn test_a_caller_cannot_loosen_the_floor_below_the_oracle() {
    let env = setup();
    let handler = btc_handler(env);
    // min_out below the oracle floor is simply ignored; the swap still clears
    // at fair value.
    handler.dispatch(0, 1, route(env.strk, env.wbtc));
    assert!(balance(env.wbtc, payout()) == FAIR_SATS, "oracle floor won");
}

// ---------------------------------------------------------------------------
// Route validation
// ---------------------------------------------------------------------------

#[test]
#[should_panic(expected: 'bad route')]
fn test_a_route_ending_in_the_wrong_token_is_rejected() {
    let env = setup();
    let handler = btc_handler(env);
    handler.dispatch(0, 0, route(env.strk, env.other));
}

#[test]
#[should_panic(expected: 'bad route')]
fn test_an_empty_route_is_rejected() {
    let env = setup();
    let handler = btc_handler(env);
    handler.dispatch(0, 0, array![]);
}

// ---------------------------------------------------------------------------
// A bad feed is a refusal, not a discount.
// ---------------------------------------------------------------------------

#[test]
#[should_panic(expected: 'stale price in')]
fn test_a_stale_input_feed_reverts() {
    let env = setup();
    let handler = btc_handler(env);
    set_median(env, STRK_USD, STRK_PRICE, NOW - 3601, 5);
    handler.dispatch(0, 0, route(env.strk, env.wbtc));
}

#[test]
#[should_panic(expected: 'stale price out')]
fn test_a_stale_output_feed_reverts() {
    let env = setup();
    let handler = btc_handler(env);
    set_median(env, WBTC_USD, BTC_PRICE, NOW - 3601, 5);
    handler.dispatch(0, 0, route(env.strk, env.wbtc));
}

#[test]
fn test_a_feed_exactly_at_the_age_limit_is_still_good() {
    let env = setup();
    let handler = btc_handler(env);
    set_median(env, STRK_USD, STRK_PRICE, NOW - 3600, 5);
    handler.dispatch(0, 0, route(env.strk, env.wbtc));
    assert!(balance(env.wbtc, payout()) == FAIR_SATS, "one hour old is within bounds");
}

#[test]
#[should_panic(expected: 'thin feed in')]
fn test_a_thin_input_feed_reverts() {
    let env = setup();
    let handler = btc_handler(env);
    set_median(env, STRK_USD, STRK_PRICE, NOW, 2);
    handler.dispatch(0, 0, route(env.strk, env.wbtc));
}

#[test]
#[should_panic(expected: 'thin feed out')]
fn test_a_thin_output_feed_reverts() {
    let env = setup();
    let handler = btc_handler(env);
    set_median(env, WBTC_USD, BTC_PRICE, NOW, 2);
    handler.dispatch(0, 0, route(env.strk, env.wbtc));
}

#[test]
#[should_panic(expected: 'bad price')]
fn test_a_zero_price_reverts() {
    let env = setup();
    let handler = btc_handler(env);
    set_median(env, STRK_USD, 0, NOW, 5);
    handler.dispatch(0, 0, route(env.strk, env.wbtc));
}

#[test]
fn test_a_feed_timestamped_slightly_ahead_does_not_underflow() {
    let env = setup();
    let handler = btc_handler(env);
    // Clock skew between the oracle and the sequencer must read as age zero,
    // not as an enormous age that reverts every dispatch.
    set_median(env, STRK_USD, STRK_PRICE, NOW + 60, 5);
    handler.dispatch(0, 0, route(env.strk, env.wbtc));
    assert!(balance(env.wbtc, payout()) == FAIR_SATS, "skew is tolerated");
}
