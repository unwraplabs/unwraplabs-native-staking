//! Mock AVNU exchange.
//!
//! Reproduces the two behaviours that shape the handler's dispatch path:
//! it asserts `beneficiary == caller`, and it pays the beneficiary out of its
//! own pre-funded balance. `numerator/denominator` sets the fill rate so a test
//! can produce a deliberately bad fill and watch the floor reject it.

#[starknet::interface]
pub trait IMockRouterAdmin<T> {
    /// out = in * numerator / denominator, before decimal scaling.
    fn set_rate(ref self: T, numerator: u256, denominator: u256);
    /// When true, skip the router's own min-amount check, so a test can prove
    /// the handler's post-swap delta assertion is what catches a bad fill.
    fn set_skip_min_check(ref self: T, skip: bool);
}

#[starknet::contract]
pub mod MockRouter {
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
    use starknet::{ContractAddress, get_caller_address, get_contract_address};
    use unwrap_staking::interfaces::Route;
    use unwrap_staking::mocks::erc20::{IMockERC20Dispatcher, IMockERC20DispatcherTrait};

    #[storage]
    struct Storage {
        numerator: u256,
        denominator: u256,
        skip_min_check: bool,
    }

    #[constructor]
    fn constructor(ref self: ContractState, numerator: u256, denominator: u256) {
        self.numerator.write(numerator);
        self.denominator.write(denominator);
    }

    #[abi(embed_v0)]
    impl Exchange of unwrap_staking::interfaces::IExchange<ContractState> {
        fn multi_route_swap(
            ref self: ContractState,
            token_from_address: ContractAddress,
            token_from_amount: u256,
            token_to_address: ContractAddress,
            token_to_amount: u256,
            token_to_min_amount: u256,
            beneficiary: ContractAddress,
            integrator_fee_amount_bps: u128,
            integrator_fee_recipient: ContractAddress,
            routes: Array<Route>,
        ) -> bool {
            let caller = get_caller_address();
            // The real AVNU exchange enforces this in `before_swap`.
            assert(beneficiary == caller, 'Beneficiary is not the caller');
            assert(routes.len() > 0, 'Routes is empty');

            IMockERC20Dispatcher { contract_address: token_from_address }
                .transfer_from(caller, get_contract_address(), token_from_amount);

            let out = token_from_amount * self.numerator.read() / self.denominator.read();
            if !self.skip_min_check.read() {
                assert(out >= token_to_min_amount, 'Insufficient tokens received');
            }
            IMockERC20Dispatcher { contract_address: token_to_address }.transfer(beneficiary, out);
            true
        }
    }

    #[abi(embed_v0)]
    impl Admin of super::IMockRouterAdmin<ContractState> {
        fn set_rate(ref self: ContractState, numerator: u256, denominator: u256) {
            self.numerator.write(numerator);
            self.denominator.write(denominator);
        }

        fn set_skip_min_check(ref self: ContractState, skip: bool) {
            self.skip_min_check.write(skip);
        }
    }
}
