import { LINKS, VALIDATOR, config, explorerClass, explorerContract } from "@/lib/config";
import { shortHex } from "@/lib/format";

export function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-[1400px] flex-wrap gap-x-6 gap-y-2 px-5 py-5 font-mono text-[11.5px] text-ink-3 md:px-10">
        <span>Starknet mainnet</span>
        <a
          href={explorerContract(VALIDATOR.address)}
          target="_blank"
          rel="noopener noreferrer"
          className="transition-colors hover:text-ink"
        >
          Validator {shortHex(VALIDATOR.address)}
        </a>
        {config.deployed.handlerClassHash ? (
          <a
            href={explorerClass(config.deployed.handlerClassHash)}
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-ink"
          >
            Receiver class hash {shortHex(config.deployed.handlerClassHash)}
          </a>
        ) : (
          <span>Receiver class hash published at deploy</span>
        )}
        <span className="flex-1" />
        <a href={LINKS.repo} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-ink">
          Source
        </a>
        <a
          href={LINKS.validatorRecord}
          target="_blank"
          rel="noopener noreferrer"
          className="transition-colors hover:text-ink"
        >
          Validator record
        </a>
        <a href={LINKS.site} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-ink">
          unwraplabs.com
        </a>
      </div>
    </footer>
  );
}
