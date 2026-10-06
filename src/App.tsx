import { RouterProvider } from "@tanstack/react-router";
import { DogeOSProvider } from "@/components/dogeos/DogeOSProvider";
import { GlobalAudioEffects } from "@/components/studio/GlobalAudioEffects";
import { StudioProvider } from "@/context/StudioContext";
import { router } from "./router";

export default function App() {
  return (
    <>
      <GlobalAudioEffects />
      <DogeOSProvider>
        <StudioProvider openCreatePage={() => void router.navigate({ to: "/create" })}>
          <RouterProvider router={router} />
        </StudioProvider>
      </DogeOSProvider>
    </>
  );
}
