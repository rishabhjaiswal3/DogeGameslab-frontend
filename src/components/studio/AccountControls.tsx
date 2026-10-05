import { useState } from "react";

import { DogeOSWalletPanel } from "@/components/dogeos/DogeOSWalletPanel";
import { StudioSignInButton } from "@/components/studio/StudioSignInButton";
import { PixelIcon } from "@/components/term/PixelIcon";
import { Block, Btn } from "@/components/term/Term";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useStudioAuth } from "@/hooks/useStudioAuth";
import { cn } from "@/lib/utils";

export function AccountControls({ collapsed }: { collapsed: boolean }) {
  const { ready, authenticated, signOut } = useStudioAuth();
  const [walletModalOpen, setWalletModalOpen] = useState(false);

  if (!ready) return <Block className={cn("mb-3 h-10", collapsed ? "mx-auto w-10" : "w-full")} />;

  if (!authenticated) {
    return (
      <div className="mb-3">
        <StudioSignInButton variant="sidebar" compact={collapsed} />
      </div>
    );
  }

  const rowClass = collapsed ? "mx-auto" : "w-full justify-start";

  return (
    <div className="mb-3 flex flex-col gap-2">
      <Btn
        variant="ghost"
        size={collapsed ? "icon" : "md"}
        onClick={() => setWalletModalOpen(true)}
        className={cn("text-doge", rowClass)}
        title="Open DogeOS wallet"
        aria-label="Open DogeOS wallet"
      >
        <PixelIcon name="wallet" size={14} />
        {!collapsed && "DogeOS Wallet"}
      </Btn>

      <Dialog open={walletModalOpen} onOpenChange={setWalletModalOpen}>
        <DialogContent className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-md overflow-y-auto p-0">
          <DialogTitle className="px-titlebar">dogeos_wallet.sys</DialogTitle>
          <DialogDescription className="sr-only">
            View your DOGE balance and copy your address.
          </DialogDescription>
          <div className="p-4 sm:p-5">
            <DogeOSWalletPanel />
          </div>
        </DialogContent>
      </Dialog>

      <Btn
        variant="danger"
        size={collapsed ? "icon" : "md"}
        onClick={signOut}
        className={rowClass}
        title="Sign out"
        aria-label="Sign out"
      >
        <PixelIcon name="exit" size={14} />
        {!collapsed && "Sign out"}
      </Btn>
    </div>
  );
}
