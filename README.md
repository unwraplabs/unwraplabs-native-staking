# Unwrap Labs — Starknet validator

Native staking with a top-3 Bitcoin validator on Starknet, plus the thing nobody
else offers: **your rewards are claimed for you every epoch and sent to your
address**, as Bitcoin if that is what you staked.

This repository is the whole of it — the contracts that do the claiming, the app
delegators use, and the keeper that runs on a schedule.

```
contracts/   Cairo: the rewards receiver and its factory, plus tests
web/         Next.js app (landing + dashboard) and the scheduled keeper
scripts/     declare, deploy, and the verification steps below
config/      mainnet.json — the single source of truth for every address
```

---

## What the contracts cannot do, and why that is structural

Two facts about Starknet's staking pool carry the entire design. Both are worth
checking in [the pool source](https://github.com/starkware-libs/starknet-staking/blob/main/src/pool/pool.cairo)
rather than taking from us:

1. `claim_rewards(pool_member)` accepts a call from **the pool member or their
   reward address**.
2. `change_reward_address` accepts a call from **the pool member only**.

So a contract installed as your reward address is *already* authorised to claim,
and only you can install or remove it. There is no approval to grant, no
allowance to set, and no permission for us to hold.

From that, three properties follow — not as promises about our conduct, but as
things the code cannot do:

**It cannot touch your principal.** The receiver never calls an exit function,
and the pool would reject it if it did: `exit_delegation_pool_intent` is
pool-member-only, and the receiver is not the pool member.

**It cannot pay anyone but you.** `payout` is written once in the constructor and
is the only destination anywhere in the contract. A different destination is a
different receiver at a different address, and only you can point your reward
address at it.

**It cannot be changed.** No owner, no admin, no pause, no upgrade path, no
setters. Every field is written in the constructor and read forever after.

Almost every entrypoint is therefore permissionless, and that is safe rather
than reckless: each receiver serves exactly one delegator, so a stranger calling
`dispatch` can only cause your rewards to reach you sooner, at their expense.

### The escape hatch

`escape()` sends everything the receiver holds straight to `payout` as STRK,
with no swap, no oracle and no router.

It exists so a delegator is never trapped behind infrastructure they do not
control. If Pragma stops publishing, or the router runs dry, `dispatch` refuses
to run — correctly, because it cannot price the swap. `escape` is the way out:
it gives up the conversion, not the money.

It is the **one restricted entrypoint**, callable only by the payout or pool
member address. A permissionless escape would let any caller pre-empt every
dispatch and force STRK on a delegator who asked for Bitcoin. Nothing is stolen
by that, but it overrides a choice that is not the caller's to make. Restricting
it costs the delegator nothing, since `payout` is their own address.

### The one real trust surface: slippage

`dispatch` is callable by anyone, so a hostile caller could pass `min_out = 0`
and sandwich the swap. The receiver defends itself:

- It derives its own floor from two Pragma medians, decimal-adjusted, less
  `max_slippage_bps` — a **1% slippage cap**, fixed, with the constructor
  rejecting anything above it.
- The effective floor is `max(caller_min_out, oracle_floor)`. A caller may
  tighten it and can never loosen it.
- A feed older than an hour, aggregating fewer than 3 sources, or reporting a
  non-positive price is a **refusal, not a discount** — the swap reverts and the
  rewards simply wait for the next run.
- After the swap it checks the **measured balance delta**, not the router's
  return value, so a router that misreports what it sent still cannot get a bad
  fill past it.

### A manual claim is not a stuck state

If you claim from the pool yourself while auto-claim is on, the pool pays your
reward address — the receiver — with no call attached, and the balance sits
there. Nothing is lost and nobody needs to be asked: the next scheduled run
sweeps it, and the dashboard gives you a button to push it out immediately. The
funds are only ever payable to your address regardless of who calls.

The app avoids the situation in the first place by routing your "Claim now"
button through the receiver's `claim_and_dispatch` while auto-claim is on.

---

## Opting in, end to end

One signature. It is yours to undo, and you never have to ask us.

```
1. handler = factory.handler_address(pool, me, my_payout, out_token)
2. pool.change_reward_address(handler)      <- only you can make this call
3. factory.deploy_handler(...)              <- us, or anyone, any time after
4. keeper: handler.claim_and_dispatch(0, 0, routes) each week
```

The app bundles steps 2 and 3 into a single multicall, so it is still one
signature and you do not wait on anyone to deploy.

Step 3 can lag step 2 safely. An ERC20 balance at a not-yet-deployed address is
just an entry in the token's storage map, so rewards that arrive before the
receiver exists are not lost — it picks them up the moment it is deployed.

**Opting out:** `pool.change_reward_address(your_own_address)`. The keeper reads
the pool's reward address on every run, sees it no longer points at the receiver,
and stops. There is no list to be removed from.

---

## The AI audit buttons

The dark section carries two buttons that open Claude or ChatGPT with a prefilled
audit prompt. The prompt links the repo and the deployed classes on Voyager, but
the part that matters is that it also links **the upstream code the receiver
depends on**:

- `starkware-libs/starknet-staking`, pinned to commit
  `5c11a5689f2d2e08ffecebf30d3e49569accbfca` — the commit our interfaces were
  transcribed from, so a reader checks the same code we built against rather
  than a moving `main`.
- `avnu-labs` — the exchange the swap routes through.
- `docs.pragma.build` — the oracle behind the price floor.

Without those, a model has to guess at what the pool, the router and the oracle
do, and a model guessing about a contract it has not read reliably invents a
worst case. That is not scepticism, it is noise, and it scares people away from
something it never checked. The prompt says so explicitly: base conclusions on
what the upstream contracts actually do, and say "I could not verify this"
rather than assuming.

---

## Switching delegation

A delegator can move stake here from another validator in **one transaction** —
no unstaking, no exit window, no gap where the stake is idle.

That is possible because `switch_delegation_pool` only requires an exit intent
to *exist* (`unpool_time.is_some()` and `amount <= unpool_amount`); it does not
check that the window has elapsed. So the app signals the intent and switches in
the same multicall.

Two details in that flow are easy to get wrong, and both are handled in
`hooks/useDelegator.ts`:

- `exit_delegation_pool_intent(amount)` **sets** `unpool_amount` rather than
  adding to it, so calling it when a larger exit is already pending would shrink
  that exit. It is skipped when enough is already signalled.
- The switch carries the source pool's reward address to the destination, and
  the destination reverts with `REWARD_ADDRESS_MISMATCH` if the delegator is
  already a member there with a different one. When that applies, the source's
  reward address is aligned first — a call only the delegator can make.

---

## Service terms

Automated claiming is free, and we pay the gas.

Positions worth **$100,000 or more** are claimed on a dependable schedule. Below
that, auto-claim still works and can still be turned on — there is no minimum in
the contract, and **no control in the app is ever disabled because of it** — but
a small position may not accrue enough between runs to be worth the gas, so it
is claimed once enough has accumulated, at the operator's discretion.

Staking, unstaking and switching have no minimum at all.

When the price API is unreachable the app hides money figures rather than
guessing, and falls back to fixed thresholds: **1 BTC**, or **5M STRK**.

All three thresholds are display-only and overridable, so a small position can
be exercised end to end on mainnet without editing code:

```
NEXT_PUBLIC_SERVICE_MIN_USD=1
NEXT_PUBLIC_SERVICE_MIN_BTC=0.00001
NEXT_PUBLIC_SERVICE_MIN_STRK=1
```

---

## Verifying it yourself

This is the step that matters. Do not take our word for what the contract
holding your rewards does.

```bash
scripts/verify-class-hash.sh
```

It recompiles `RewardsHandler` from source, prints the resulting class hash next
to the one recorded in `web/config/mainnet.json`, and confirms that class is declared
on chain. If they differ, the deployed receiver is not this source — do not opt
in.

You can also check the price feeds the receiver will depend on:

```bash
node scripts/verify-feeds.mjs
```

This reads each configured Pragma pair straight from the oracle and reports
whether it clears the receiver's hardcoded bounds (3+ sources, under an hour
old, positive price).

---

## Pricing

Every non-STRK asset is priced off **`WBTC/USD`**. Read live from the oracle:

| Pair | Sources | Status |
| --- | --- | --- |
| `STRK/USD` | 10 | The input leg of every swap |
| `WBTC/USD` | 8 | The output leg for every BTC asset |
| `BTC/USD` | 10 | Exists, but unused — see below |
| `LBTC/USD` | 2 | **Below the 3-source minimum** |
| `SOLVBTC/USD`, `STRKBTC/USD`, `TBTC/USD` | — | Do not exist |

Pragma has no feed for strkBTC or SolvBTC, so they use WBTC's — the only BTC
feed on Pragma with its own dedicated, well-sourced median.

This is an approximation, and worth stating plainly rather than burying: if a
wrapper drifts from WBTC, the effective slippage tolerance moves by roughly the
size of that gap. A wrapper trading *above* WBTC makes the floor too high and the
swap simply reverts, which is the safe direction; one trading *below* widens the
1% bound by the discount. The bound stays finite either way, capped by the
wrapper's deviation. If these tokens attract real volume, list dedicated feeds on
Pragma and update `web/config/mainnet.json`.

`tBTC` and `LBTC` pools are offered without auto-swap: rewards are paid through
as STRK rather than priced against a feed we do not trust.

Re-check any time with `node scripts/verify-feeds.mjs`, which reads each pair
straight from the oracle and fails if one would not satisfy the contract.

---

## Running it

### Contracts

```bash
cd contracts
scarb build
snforge test
```

Pinned to `scarb 2.17.0` / `cairo 2.17.0` / `sierra 1.8.0` (see `.tool-versions`),
with `snforge 0.59.0`.

### App

```bash
cd web
npm install
npm run dev
```

`web/lib/chain.config.json` is a **symlink** to `web/config/mainnet.json`, so there
is exactly one copy of the addresses and it cannot go stale — edit the root file
and the app sees it immediately, running dev server included. (It used to be a
generated copy refreshed by a prebuild step, which silently went stale whenever
the config changed while `next dev` was running.)

`predev` and `prebuild` still regenerate `web/lib/abi/*` from the compiled
Sierra, since those are genuinely build output.

> Do not run `npm run build` while `npm run dev` is running. They share `.next`,
> and the build overwrites the dev server's assets — the page then loads with no
> stylesheet at all. If that happens: stop both, `rm -rf web/.next`, restart.

The Endur validator API sends `access-control-allow-origin: *`, so the browser
calls it directly and **no proxy is needed**.

### Deploying

Uses the strkfarm SDK's encrypted account store, so there is no private key in
an environment variable anywhere.

```bash
cd scripts
npm install
npm run deploy:dry                              # prints the calldata, sends nothing
ACCOUNT_SECURE_PASSWORD=... npm run deploy      # declares and deploys
```

It rebuilds the contracts with `scarb --release build` first — declaring a stale
class is the one mistake here that stays invisible until someone verifies the
hash and finds it does not match the source. The release profile must emit CASM
(`casm = true` in `Scarb.toml`), because a declare needs the compiled class hash
as well as the Sierra.

The account key defaults to `unwrap-deployer`; override with `DEPLOY_ACCOUNT`,
and the store file with `ACCOUNTS_FILE_NAME`. The script writes the resulting
class hash and factory address straight back into `web/config/mainnet.json`, so the
app and the keeper pick them up with no retyping.

Then run `scripts/verify-class-hash.sh`.

> `scripts/` is its own npm package on purpose. The SDK pins `starknet@9.2.1`
> while `web/` is held at `starknet@8` by starknet-react and starknetkit;
> isolating them lets each have the version it needs. It is also CommonJS,
> because the SDK's ESM build has a broken `@apollo/client` interop.

### The keeper

Currently scheduled **every 6 hours** (`0 */6 * * *` in `vercel.json`) while the
service is being exercised; the intended steady-state cadence is weekly, and the
UI describes it as weekly because running more often than promised is not a
claim that needs correcting. The same code runs standalone on Render or any cron
host:

```bash
node web/scripts/keeper.mjs --dry-run
```

Environment lives in `.env.example`. The keeper account pays gas and nothing
else — receivers only ever pay their own delegator, so that key cannot take
funds even if it is lost.

Each run walks the factory's subscription index, checks every candidate against
the pool's current reward address, and sends **one transaction per subscription**
so that one delegator's bad swap route cannot revert everyone else's claim. It
logs one JSON object per line, tagged with a run id, so a question about a
specific delegator on a specific week is answerable with `grep`.

Event scans start from `deployed.deployedAtBlock` in the config, which the
deploy script records. This is not a micro-optimisation: scanning from genesis
made the RPC walk the chain in ~82k-block chunks, returning an empty page with
a continuation token for each, so a receiver with no events took 178 requests
and 103 seconds to report nothing. From the factory's block it is one request
and about half a second. No receiver can predate its factory, so that block is
a sound floor; if it is ever missing, the app finds it by binary search rather
than falling back to zero.

There is deliberately **no indexer and no database**. The factory's index is the
candidate list and the pool's reward address is the truth; nothing is cached, so
nothing can be stale.

### Vercel

Set the project's **Root Directory** to `web`.

`vercel.json` lives in `web/`, not at the repo root, because Vercel reads it
from the Root Directory — at the repo root it would be silently ignored and the
cron would never register. If you ever change the Root Directory, move it too.

Reaching outside the Root Directory is fine: Vercel clones the whole repository
and only changes the working directory, so the `web/lib/chain.config.json`
symlink resolves to `web/config/mainnet.json` at build time. The JSON is inlined
into the bundle, so nothing outside `web/` is needed at runtime.

Lock files are committed for all three packages (`web/`, `scripts/`,
`contracts/`), so installs are reproducible — which matters here, since the
peer constraints between starknet-react, starknetkit and starknet only resolve
at specific versions.

---

## Tests

45 Cairo tests (`snforge test`) covering, among others:

- the derived address matches what `deploy_handler` actually produces
- a claim with nothing pending does not call the pool at all
- the stranded-rewards case: STRK transferred in with no call is forwarded in full
- `min_out = 0` from a hostile caller still gets the oracle floor
- a router that misreports its output is caught by the measured delta
- stale, thin, and zero-price feeds each revert, and clock skew does not underflow
- a constructor with `max_slippage_bps = 101` reverts
- `sweep` moves arbitrary tokens to `payout` and refuses the reward token
- `escape` releases STRK unswapped, only for the delegator, and still only to
  `payout` even when the pool member is the caller

33 TypeScript tests (`npm test` in `web/`) covering AVNU route parsing — which
is offset-based and would otherwise fail silently — the address and decimal
handling the display and the keeper both depend on, the position ordering and
service-threshold rules, the receiver-activity summary, and the
`Option<PoolMemberInfoV1>` wire format.

That last one earned its tests. The pool returns `Option<PoolMemberInfoV1>`, and
a hand-written ABI cannot describe it — it names a struct and a `Timestamp` the
app has no definition for, so starknet.js could not reliably tell `Some` from
`None` and fell through to a truthy value. Every non-member then read as a
member with a zero balance, which sent staking down `add_to_delegation_pool` and
reverted with "Pool member does not exist". It is now decoded from raw felts,
against responses captured from the live pool.

---

## Status

The contracts are **unaudited**. The factory address in `web/config/mainnet.json` is
unset until deployment; until then the app renders the landing page and the
keeper exits cleanly with nothing to do.
