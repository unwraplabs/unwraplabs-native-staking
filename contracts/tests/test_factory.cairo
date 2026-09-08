//! The factory's index and token table.
//!
//! The index exists so the keeper can enumerate subscriptions from chain state
//! alone — no indexer, no database. It grants nothing.

use unwrap_staking::factory::IHandlerFactoryDispatcherTrait;
use unwrap_staking::handler::{IRewardsHandlerDispatcher, IRewardsHandlerDispatcherTrait};
use super::common::{WBTC_USD, member, payout, setup, stranger};

fn zero() -> starknet::ContractAddress {
    0.try_into().unwrap()
}

#[test]
fn test_the_index_records_every_deployment() {
    let env = setup();
    assert!(env.factory.subscriptions_count() == 0, "starts empty");

    let btc = env.factory.deploy_handler(env.pool, member(), payout(), env.wbtc);
    let strk = env.factory.deploy_handler(env.pool, member(), payout(), zero());

    assert!(env.factory.subscriptions_count() == 2, "both recorded");
    let first = env.factory.subscription_at(0);
    assert!(first.handler == btc, "index 0 is the BTC handler");
    assert!(first.out_token == env.wbtc, "carries the out token");
    assert!(env.factory.subscription_at(1).handler == strk, "index 1 is the STRK handler");
    assert!(env.factory.is_handler(btc), "recognised as ours");
    assert!(!env.factory.is_handler(stranger()), "and a stranger is not");
}

#[test]
fn test_one_delegator_can_stake_several_assets() {
    let env = setup();
    let btc = env.factory.deploy_handler(env.pool, member(), payout(), env.wbtc);
    let strk = env.factory.deploy_handler(env.pool, member(), payout(), zero());
    // A different delegator, to prove the per-member list is actually filtered.
    env.factory.deploy_handler(env.pool, stranger(), payout(), env.wbtc);

    let mine = env.factory.subscriptions_of(member());
    assert!(mine.len() == 2, "two positions for this delegator");
    assert!(*mine[0].handler == btc, "BTC first");
    assert!(*mine[1].handler == strk, "STRK second");
    assert!(env.factory.subscriptions_of(stranger()).len() == 1, "and one for the other");
}

#[test]
fn test_pagination_clamps_to_the_end_of_the_list() {
    let env = setup();
    env.factory.deploy_handler(env.pool, member(), payout(), env.wbtc);
    env.factory.deploy_handler(env.pool, member(), payout(), zero());

    assert!(env.factory.subscriptions(0, 100).len() == 2, "a limit past the end is clamped");
    assert!(env.factory.subscriptions(1, 100).len() == 1, "offset applies");
    assert!(env.factory.subscriptions(5, 10).len() == 0, "past the end is empty, not a revert");
}

#[test]
#[should_panic(expected: 'index out of range')]
fn test_reading_past_the_end_reverts() {
    let env = setup();
    env.factory.subscription_at(0);
}

#[test]
#[should_panic(expected: 'token not supported')]
fn test_an_unregistered_out_token_is_refused() {
    let env = setup();
    // `other` has no Pragma pair in the factory's table, so a handler for it
    // could never derive a meaningful floor.
    env.factory.deploy_handler(env.pool, member(), payout(), env.other);
}

#[test]
fn test_the_token_table_is_readable() {
    let env = setup();
    let tokens = env.factory.supported_tokens();
    assert!(tokens.len() == 1, "one registered out token in the fixture");
    assert!(*tokens[0].token == env.wbtc, "the BTC token");
    assert!(*tokens[0].decimals == 8, "with its decimals");
    assert!(*tokens[0].pair == WBTC_USD, "and its Pragma pair");
    assert!(env.factory.token_config(env.other).pair == 0, "unregistered reads as zero");
}

#[test]
fn test_the_factory_and_not_the_caller_supplies_the_swap_config() {
    let env = setup();
    let addr = env.factory.deploy_handler(env.pool, member(), payout(), env.wbtc);
    let cfg = IRewardsHandlerDispatcher { contract_address: addr }.config();

    // None of these were arguments to `deploy_handler`. That is the point: a
    // handler with a loose bound or a hand-picked feed cannot land on an
    // address this factory would produce.
    assert!(cfg.max_slippage_bps == 100, "1%, fixed by the factory");
    assert!(cfg.oracle == env.oracle, "oracle fixed by the factory");
    assert!(cfg.router == env.router, "router fixed by the factory");
    assert!(cfg.pair_out == WBTC_USD, "pair from the immutable table");
    assert!(cfg.reward_token == env.strk, "rewards are STRK even for a BTC pool");
    assert!(env.factory.max_slippage_bps() == 100, "and it is advertised");
}
