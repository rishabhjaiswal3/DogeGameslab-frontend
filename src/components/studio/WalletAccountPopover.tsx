import type { ReactNode } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DogeOSWalletPanel } from "@/components/dogeos/DogeOSWalletPanel";
import { PixelIcon } from "@/components/term/PixelIcon";
import { Btn } from "@/components/term/Term";
import { clearAuthToken } from "@/lib/api";

type WalletAccountPopoverProps = {
  /** The element that opens the popover. */
  children: ReactNode;
  onSignOut: () => void | Promise<void>;
};

export function WalletAccountPopover({ children, onSignOut }: WalletAccountPopoverProps) {
  const handleSignOut = () => {
    clearAuthToken();
    void onSignOut();
  };

  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="end" sideOffset={10} className="w-[min(92vw,22rem)] p-0">
        <div
          className="px-titlebar"
          style={{ "--panel-line": "var(--phos-3)" } as React.CSSProperties}
        >
          <span className="flex-1">dogeos_wallet.sys</span>
          <span className="text-doge">● online</span>
        </div>
        <div className="p-4">
          <DogeOSWalletPanel showHeading />
        </div>
        <div className="border-t-2 border-line p-3">
          <Btn variant="danger" className="w-full" onClick={handleSignOut}>
            <PixelIcon name="exit" size={13} />
            Sign out
          </Btn>
        </div>
      </PopoverContent>
    </Popover>
  );
}
