//! Mock Pragma oracle. Each pair's median is set explicitly so tests can drive
//! the stale / thin / zero-price branches.

#[starknet::interface]
pub trait IMockOracleAdmin<T> {
    fn set_median(
        ref self: T, pair: felt252, price: u128, decimals: u32, last_updated: u64, sources: u32,
    );
}

#[starknet::contract]
pub mod MockOracle {
    use starknet::storage::{Map, StoragePathEntry, StoragePointerReadAccess, StoragePointerWriteAccess};
    use unwrap_staking::interfaces::{DataType, PragmaPricesResponse};

    #[storage]
    struct Storage {
        price: Map<felt252, u128>,
        decimals: Map<felt252, u32>,
        last_updated: Map<felt252, u64>,
        sources: Map<felt252, u32>,
    }

    #[abi(embed_v0)]
    impl Oracle of unwrap_staking::interfaces::IPragmaOracle<ContractState> {
        fn get_data_median(self: @ContractState, data_type: DataType) -> PragmaPricesResponse {
            let pair = match data_type {
                DataType::SpotEntry(p) => p,
                DataType::FutureEntry((p, _)) => p,
                DataType::GenericEntry(p) => p,
            };
            PragmaPricesResponse {
                price: self.price.entry(pair).read(),
                decimals: self.decimals.entry(pair).read(),
                last_updated_timestamp: self.last_updated.entry(pair).read(),
                num_sources_aggregated: self.sources.entry(pair).read(),
                expiration_timestamp: Option::None,
            }
        }
    }

    #[abi(embed_v0)]
    impl Admin of super::IMockOracleAdmin<ContractState> {
        fn set_median(
            ref self: ContractState,
            pair: felt252,
            price: u128,
            decimals: u32,
            last_updated: u64,
            sources: u32,
        ) {
            self.price.entry(pair).write(price);
            self.decimals.entry(pair).write(decimals);
            self.last_updated.entry(pair).write(last_updated);
            self.sources.entry(pair).write(sources);
        }
    }
}
