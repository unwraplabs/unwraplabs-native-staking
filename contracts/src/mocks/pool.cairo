//! Mock staking pool reproducing the two behaviours the handler relies on:
//!
//!   - `claim_rewards` accepts the pool member OR their reward address, and
//!     does not revert when rewards are zero.
//!   - `get_pool_member_info_v1` returns `None` for an unknown member instead
//!     of reverting.
//!
//! `claim_calls` counts entries so a test can assert the handler skipped the
//! call entirely rather than merely claiming zero.

use starknet::ContractAddress;

#[starknet::interface]
pub trait IMockPoolAdmin<T> {
    fn set_member(
        ref self: T, pool_member: ContractAddress, reward_address: ContractAddress, amount: u128,
        unclaimed_rewards: u128,
    );
    fn remove_member(ref self: T, pool_member: ContractAddress);
    fn claim_calls(self: @T) -> u32;
}

#[starknet::contract]
pub mod MockPool {
    use starknet::storage::{Map, StoragePathEntry, StoragePointerReadAccess, StoragePointerWriteAccess};
    use starknet::{ContractAddress, get_caller_address};
    use unwrap_staking::interfaces::{IERC20Dispatcher, IERC20DispatcherTrait, PoolMemberInfoV1};

    #[storage]
    struct Storage {
        strk: ContractAddress,
        exists: Map<ContractAddress, bool>,
        reward_address: Map<ContractAddress, ContractAddress>,
        amount: Map<ContractAddress, u128>,
        unclaimed: Map<ContractAddress, u128>,
        claim_calls: u32,
    }

    #[constructor]
    fn constructor(ref self: ContractState, strk: ContractAddress) {
        self.strk.write(strk);
    }

    #[abi(embed_v0)]
    impl Pool of unwrap_staking::interfaces::IPool<ContractState> {
        fn claim_rewards(ref self: ContractState, pool_member: ContractAddress) -> u128 {
            self.claim_calls.write(self.claim_calls.read() + 1);
            assert(self.exists.entry(pool_member).read(), 'POOL_MEMBER_DOES_NOT_EXIST');
            let reward_address = self.reward_address.entry(pool_member).read();
            let caller = get_caller_address();
            assert(caller == pool_member || caller == reward_address, 'UNAUTHORIZED');

            let rewards = self.unclaimed.entry(pool_member).read();
            self.unclaimed.entry(pool_member).write(0);
            // The real pool transfers even when `rewards == 0`.
            IERC20Dispatcher { contract_address: self.strk.read() }
                .transfer(reward_address, rewards.into());
            rewards
        }

        fn change_reward_address(ref self: ContractState, reward_address: ContractAddress) {
            let caller = get_caller_address();
            assert(self.exists.entry(caller).read(), 'POOL_MEMBER_DOES_NOT_EXIST');
            self.reward_address.entry(caller).write(reward_address);
        }

        fn get_pool_member_info_v1(
            self: @ContractState, pool_member: ContractAddress,
        ) -> Option<PoolMemberInfoV1> {
            if !self.exists.entry(pool_member).read() {
                return Option::None;
            }
            Option::Some(
                PoolMemberInfoV1 {
                    reward_address: self.reward_address.entry(pool_member).read(),
                    amount: self.amount.entry(pool_member).read(),
                    unclaimed_rewards: self.unclaimed.entry(pool_member).read(),
                    commission: 0,
                    unpool_amount: 0,
                    unpool_time: Option::None,
                },
            )
        }
    }

    #[abi(embed_v0)]
    impl Admin of super::IMockPoolAdmin<ContractState> {
        fn set_member(
            ref self: ContractState,
            pool_member: ContractAddress,
            reward_address: ContractAddress,
            amount: u128,
            unclaimed_rewards: u128,
        ) {
            self.exists.entry(pool_member).write(true);
            self.reward_address.entry(pool_member).write(reward_address);
            self.amount.entry(pool_member).write(amount);
            self.unclaimed.entry(pool_member).write(unclaimed_rewards);
        }

        fn remove_member(ref self: ContractState, pool_member: ContractAddress) {
            self.exists.entry(pool_member).write(false);
        }

        fn claim_calls(self: @ContractState) -> u32 {
            self.claim_calls.read()
        }
    }
}
