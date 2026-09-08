//! Address derivation.
//!
//! Cairo 2.17's corelib exposes `deploy_syscall` but no way to *precompute* the
//! address it will produce. We need that: the whole opt-in flow depends on a
//! delegator being able to point `reward_address` at a handler that does not
//! exist yet.
//!
//! So this is the Starknet contract-address formula, implemented directly. It
//! is not trusted on faith — `test_handler_address_matches_deploy` deploys for
//! real and asserts the syscall's answer equals this one, so a mistake here
//! fails the suite rather than stranding someone's rewards.

use core::pedersen::pedersen;
use starknet::{ClassHash, ContractAddress};

/// Short-string encoding of "STARKNET_CONTRACT_ADDRESS".
pub const CONTRACT_ADDRESS_PREFIX: felt252 = 'STARKNET_CONTRACT_ADDRESS';

/// 2^251 - 256. Addresses are reduced into this range.
pub const L2_ADDRESS_UPPER_BOUND: u256 =
    0x800000000000000000000000000000000000000000000000000000000000000_u256
    - 256;

/// Starknet's `compute_hash_on_elements`: a Pedersen chain seeded at 0 and
/// closed with the element count.
pub fn compute_hash_on_elements(data: Span<felt252>) -> felt252 {
    let mut result = 0;
    let mut i = 0;
    while i < data.len() {
        result = pedersen(result, *data[i]);
        i += 1;
    }
    pedersen(result, data.len().into())
}

/// The address `deploy_syscall` produces for these arguments.
///
/// Pass `deployer = 0` to match `deploy_from_zero: true`.
pub fn calculate_contract_address(
    salt: felt252, class_hash: ClassHash, calldata: Span<felt252>, deployer: ContractAddress,
) -> ContractAddress {
    let calldata_hash = compute_hash_on_elements(calldata);
    let raw = compute_hash_on_elements(
        array![
            CONTRACT_ADDRESS_PREFIX, deployer.into(), salt, class_hash.into(), calldata_hash,
        ]
            .span(),
    );
    // felt252 exceeds 2^251 - 256, so the reduction is real, not cosmetic.
    let reduced: u256 = Into::<felt252, u256>::into(raw) % L2_ADDRESS_UPPER_BOUND;
    let as_felt: felt252 = reduced.try_into().unwrap();
    as_felt.try_into().unwrap()
}
