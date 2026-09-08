pub mod factory;
pub mod handler;
pub mod interfaces;
pub mod utils;

// Test doubles. Not gated behind `cfg(test)`: `snforge` compiles the test crate
// separately from the library, so a gated module is invisible to it, and
// `declare()` needs these in the build artifacts regardless. They are never
// referenced by `handler` or `factory`.
pub mod mocks;
