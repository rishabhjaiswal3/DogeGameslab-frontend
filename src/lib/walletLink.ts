import { getTokenEvmWallet, getTokenUserId } from "./api";

// Sign-in is a wallet signature, so the studio JWT proves which wallet the user
// owns. A wallet is "signed in" when the JWT belongs to it — a DogeOS 0x
// address (compared case-insensitively) or a Dogecoin D… address (exact).

const normalize = (value: string) =>
  /^0x[a-fA-F0-9]{40}$/.test(value) ? value.toLowerCase() : value.trim();

export function isWalletLinkedOnSession(address: string | null | undefined): boolean {
  if (!address) return false;
  const target = normalize(address);
  return [getTokenEvmWallet(), getTokenUserId()].some(
    (owner) => Boolean(owner) && normalize(owner as string) === target,
  );
}
