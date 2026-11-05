import { createContext, useContext } from "react";
import type { PushController } from "./usePush.ts";

// What any screen gets from usePush(): the shared push state and the switch action. The
// provider (PushProvider.tsx) fills it in once, in Layout.
export const PushContext = createContext<PushController>({
  state: "checking",
  error: null,
  toggle: () => Promise.resolve(false),
});

export function usePush(): PushController {
  return useContext(PushContext);
}
