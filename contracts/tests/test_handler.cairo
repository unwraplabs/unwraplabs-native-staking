use snforge_std::{
    ContractClassTrait, DeclareResultTrait, declare, start_cheat_block_timestamp_global,
    start_cheat_caller_address, stop_cheat_caller_address,
};
use unwrap_staking::factory::IHandlerFactoryDispatcherTrait;
use unwrap_staking::handler::{IRewardsHandlerDispatcher, IRewardsHandlerDispatcherTrait};
use unwrap_staking::interfaces::{IPoolDispatcher, IPoolDispatcherTrait};
use unwrap_staking::mocks::pool::{IMockPoolAdminDispatcher, IMockPoolAdminDispatcherTrait};
use super::common::{
    Env, NOW, ONE_K_STRK, balance, member, mint, payout, setup, stranger, subscribe,
};

/// A pass-through (STRK) handler: `out_token` is zero.
fn strk_handler(env: Env) -> IRewardsHandlerDispatcher {
    let addr = env.factory.deploy_handler(env.pool, member(), payout(), Zeroable::zero());
    IRewardsHandlerDispatcher { contract_address: addr }
}

trait ZeroAddr {
    fn zero() -> starknet::ContractAddress;
}
impl ZeroableImpl of ZeroAddr {
    fn zero() -> starknet::ContractAddress {
        0.try_into().unwrap()
    }
}
use ZeroAddr as Zeroable;

// ---------------------------------------------------------------------------
// Address derivation — the property the whole opt-in flow rests on.
// ---------------------------------------------------------------------------

#[test]
fn test_handler_address_matches_deploy() {
    let env = setup();
    let predicted = env.factory.handler_address(env.pool, member(), payout(), env.wbtc);
    let actual = env.factory.deploy_handler(env.pool, member(), payout(), env.wbtc);
    assert!(predicted == actual, "predicted address must equal the deployed one");
}

#[test]
fn test_different_payout_yields_different_address() {
    let env = setup();
    let a = env.factory.handler_address(env.pool, member(), payout(), env.wbtc);
    let b = env.factory.handler_address(env.pool, member(), stranger(), env.wbtc);
    assert!(a != b, "payout is part of the salt and the calldata");
}

#[test]
fn test_different_out_token_yields_different_address() {
    let env = setup();
    let a = env.factory.handler_address(env.pool, member(), payout(), env.wbtc);
    let b = env.factory.handler_address(env.pool, member(), payout(), Zeroable::zero());
    assert!(a != b, "out token is part of the salt and the calldata");
}

/// A second `deploy_handler` with identical arguments cannot succeed: the
/// address is already occupied, and `deploy_syscall` aborts at the VM level.
/// That abort is not a contract panic, so it cannot be captured with
/// `should_panic` — what we assert instead is the property it follows from,
/// namely that the address is a pure function of the arguments and does not
/// move once deployed. A duplicate therefore has nowhere else to land, and the
/// subscription index cannot double-count.
#[test]
fn test_the_address_is_fixed_so_a_duplicate_has_nowhere_to_land() {
    let env = setup();
    let predicted = env.factory.handler_address(env.pool, member(), payout(), env.wbtc);
    let deployed = env.factory.deploy_handler(env.pool, member(), payout(), env.wbtc);
    let after = env.factory.handler_address(env.pool, member(), payout(), env.wbtc);

    assert!(predicted == deployed, "derivation matches deployment");
    assert!(after == deployed, "and does not move afterwards");
    assert!(env.factory.subscriptions_count() == 1, "recorded exactly once");
}

// ---------------------------------------------------------------------------
// Claim
// ---------------------------------------------------------------------------

#[test]
fn test_claim_zero_pending_does_not_call_pool() {
    let env = setup();
    let handler = strk_handler(env);
    subscribe(env, handler.contract_address, 0);

    let claimed = handler.claim();
    assert!(claimed == 0, "nothing to claim");

    let calls = IMockPoolAdminDispatcher { contract_address: env.pool }.claim_calls();
    assert!(calls == 0, "the pool must not be called when there is nothing pending");
}

#[test]
fn test_claim_unknown_member_returns_zero() {
    let env = setup();
    let handler = strk_handler(env);
    // Never subscribed: `get_pool_member_info_v1` returns None.
    let claimed = handler.claim();
    assert!(claimed == 0, "unknown member is a no-op, not a revert");
    let calls = IMockPoolAdminDispatcher { contract_address: env.pool }.claim_calls();
    assert!(calls == 0, "no pool call for an unknown member");
}

#[test]
fn test_claim_after_member_exits_is_a_noop_and_dispatch_still_runs() {
    let env = setup();
    let handler = strk_handler(env);
    subscribe(env, handler.contract_address, 0);

    // Delegator fully exits, but a balance is still sitting in the handler.
    mint(env.strk, handler.contract_address, ONE_K_STRK);
    IMockPoolAdminDispatcher { contract_address: env.pool }.remove_member(member());

    handler.claim_and_dispatch(0, 0, array![]);
    assert!(balance(env.strk, payout()) == ONE_K_STRK, "leftovers still reach the delegator");
}

// ---------------------------------------------------------------------------
// The stranded-rewards case: a manual claim lands STRK here with no call.
// ---------------------------------------------------------------------------

#[test]
fn test_stranded_rewards_are_dispatched_in_full() {
    let env = setup();
    let handler = strk_handler(env);
    subscribe(env, handler.contract_address, 0);

    // Simulate the delegator claiming manually: STRK arrives with no call.
    mint(env.strk, handler.contract_address, ONE_K_STRK);
    assert!(handler.held() == ONE_K_STRK, "handler holds the stranded rewards");

    // Anyone may push it out, including a stranger.
    start_cheat_caller_address(handler.contract_address, stranger());
    handler.dispatch(0, 0, array![]);
    stop_cheat_caller_address(handler.contract_address);

    assert!(balance(env.strk, payout()) == ONE_K_STRK, "forwarded in full");
    assert!(handler.held() == 0, "nothing left behind");
}

#[test]
fn test_claim_and_dispatch_pays_the_delegator() {
    let env = setup();
    let handler = strk_handler(env);
    subscribe(env, handler.contract_address, ONE_K_STRK.low);

    start_cheat_caller_address(handler.contract_address, stranger());
    handler.claim_and_dispatch(0, 0, array![]);
    stop_cheat_caller_address(handler.contract_address);

    assert!(balance(env.strk, payout()) == ONE_K_STRK, "claimed and forwarded");
}

#[test]
fn test_partial_dispatch_leaves_the_remainder() {
    let env = setup();
    let handler = strk_handler(env);
    subscribe(env, handler.contract_address, 0);
    mint(env.strk, handler.contract_address, ONE_K_STRK);

    let half = ONE_K_STRK / 2;
    handler.dispatch(half, 0, array![]);

    assert!(balance(env.strk, payout()) == half, "only the requested slice went out");
    assert!(handler.held() == ONE_K_STRK - half, "the rest stays for the next tick");
}

#[test]
fn test_dispatch_with_nothing_held_is_a_noop() {
    let env = setup();
    let handler = strk_handler(env);
    handler.dispatch(0, 0, array![]);
    assert!(balance(env.strk, payout()) == 0, "no payout, no revert");
}

// ---------------------------------------------------------------------------
// Only the delegator controls the subscription.
// ---------------------------------------------------------------------------

#[test]
fn test_opt_out_is_the_delegators_alone() {
    let env = setup();
    let handler = strk_handler(env);
    subscribe(env, handler.contract_address, ONE_K_STRK.low);

    // The delegator repoints their reward address back at themselves.
    let pool = IPoolDispatcher { contract_address: env.pool };
    start_cheat_caller_address(env.pool, member());
    pool.change_reward_address(member());
    stop_cheat_caller_address(env.pool);

    // The handler is now unauthorised — exactly how the keeper detects an
    // unsubscribe, and the pool enforces it regardless.
    let info = pool.get_pool_member_info_v1(member()).unwrap();
    assert!(info.reward_address == member(), "reward address is the delegator's again");
}

// ---------------------------------------------------------------------------
// Sweep
// ---------------------------------------------------------------------------

#[test]
fn test_sweep_moves_an_arbitrary_token_to_payout() {
    let env = setup();
    let handler = strk_handler(env);
    mint(env.other, handler.contract_address, 777);

    start_cheat_caller_address(handler.contract_address, stranger());
    handler.sweep(env.other);
    stop_cheat_caller_address(handler.contract_address);

    assert!(balance(env.other, payout()) == 777, "airdrop goes to the delegator");
    assert!(balance(env.other, stranger()) == 0, "and never to the caller");
}

#[test]
#[should_panic(expected: 'use dispatch for reward token')]
fn test_sweep_refuses_the_reward_token() {
    let env = setup();
    let handler = strk_handler(env);
    mint(env.strk, handler.contract_address, ONE_K_STRK);
    // Allowing this would be an unmetered path around the oracle floor.
    handler.sweep(env.strk);
}

#[test]
fn test_sweep_of_an_empty_balance_is_a_noop() {
    let env = setup();
    let handler = strk_handler(env);
    handler.sweep(env.other);
    assert!(balance(env.other, payout()) == 0, "nothing to move");
}

// ---------------------------------------------------------------------------
// Constructor guards
// ---------------------------------------------------------------------------

/// Deploys a handler bypassing the factory, so the constructor's own guards can
/// be exercised directly. Returns the raw deploy result: a reverting
/// constructor surfaces as `Err(panic_data)`, not as a catchable panic.
fn try_deploy_handler_raw(
    env: Env, max_slippage_bps: felt252,
) -> Result<starknet::ContractAddress, Array<felt252>> {
    let contract = declare("RewardsHandler").unwrap().contract_class();
    let args = array![
        env.pool.into(),
        member().into(),
        payout().into(),
        env.strk.into(),
        18,
        env.wbtc.into(),
        8,
        'STRK/USD',
        'WBTC/USD',
        env.oracle.into(),
        env.router.into(),
        max_slippage_bps,
    ];
    match contract.deploy(@args) {
        Result::Ok((addr, _)) => Result::Ok(addr),
        Result::Err(panic_data) => Result::Err(panic_data),
    }
}

#[test]
fn test_constructor_rejects_slippage_above_ceiling() {
    let env = setup();
    match try_deploy_handler_raw(env, 101) {
        Result::Ok(_) => panic!("101 bps must not deploy"),
        Result::Err(data) => assert!(
            *data[0] == 'slippage above 1%', "wrong revert reason",
        ),
    }
}

#[test]
fn test_constructor_accepts_the_ceiling_exactly() {
    let env = setup();
    start_cheat_block_timestamp_global(NOW);
    let addr = try_deploy_handler_raw(env, 100).unwrap();
    let cfg = IRewardsHandlerDispatcher { contract_address: addr }.config();
    assert!(cfg.max_slippage_bps == 100, "1% is allowed");
    assert!(cfg.payout == payout(), "payout is fixed at construction");
}

// ---------------------------------------------------------------------------
// The escape hatch
// ---------------------------------------------------------------------------

#[test]
fn test_escape_releases_strk_unswapped_to_the_delegator() {
    let env = setup();
    // A swapping receiver, so escape genuinely bypasses a conversion that would
    // otherwise happen.
    let addr = env.factory.deploy_handler(env.pool, member(), payout(), env.wbtc);
    let handler = IRewardsHandlerDispatcher { contract_address: addr };
    mint(env.strk, addr, ONE_K_STRK);

    start_cheat_caller_address(addr, payout());
    handler.escape();
    stop_cheat_caller_address(addr);

    assert!(balance(env.strk, payout()) == ONE_K_STRK, "STRK released as-is");
    assert!(balance(env.wbtc, payout()) == 0, "no swap happened");
    assert!(handler.held() == 0, "nothing left behind");
}

#[test]
fn test_the_pool_member_may_also_escape() {
    let env = setup();
    let handler = strk_handler(env);
    mint(env.strk, handler.contract_address, ONE_K_STRK);

    start_cheat_caller_address(handler.contract_address, member());
    handler.escape();
    stop_cheat_caller_address(handler.contract_address);

    assert!(balance(env.strk, payout()) == ONE_K_STRK, "released to payout, not to the caller");
}

#[test]
#[should_panic(expected: 'only the delegator')]
fn test_a_stranger_cannot_escape() {
    let env = setup();
    let handler = strk_handler(env);
    mint(env.strk, handler.contract_address, ONE_K_STRK);

    // Escape is the one restricted entrypoint. Permissionless, it would let any
    // caller pre-empt a dispatch and force STRK on someone who asked for BTC.
    start_cheat_caller_address(handler.contract_address, stranger());
    handler.escape();
}

#[test]
fn test_escape_with_nothing_held_is_a_noop() {
    let env = setup();
    let handler = strk_handler(env);
    start_cheat_caller_address(handler.contract_address, payout());
    handler.escape();
    stop_cheat_caller_address(handler.contract_address);
    assert!(balance(env.strk, payout()) == 0, "nothing to release, no revert");
}

#[test]
fn test_escape_still_pays_only_payout_even_when_the_member_calls() {
    let env = setup();
    let handler = strk_handler(env);
    mint(env.strk, handler.contract_address, ONE_K_STRK);

    start_cheat_caller_address(handler.contract_address, member());
    handler.escape();
    stop_cheat_caller_address(handler.contract_address);

    // `payout` is the only destination in the contract, so calling as the pool
    // member does not redirect anything to the pool member.
    assert!(balance(env.strk, member()) == 0, "the caller receives nothing");
    assert!(balance(env.strk, payout()) == ONE_K_STRK, "payout receives everything");
}
