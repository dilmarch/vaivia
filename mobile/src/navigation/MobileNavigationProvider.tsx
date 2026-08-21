import {
  createContext,
  useContext,
  type ReactNode,
} from "react";
import { useMobileRouter } from "./useMobileRouter";

type MobileNavigationController = ReturnType<typeof useMobileRouter>;

const MobileNavigationContext =
  createContext<MobileNavigationController | null>(null);

export function MobileNavigationProvider({ children }: { children: ReactNode }) {
  const controller = useMobileRouter();
  return (
    <MobileNavigationContext.Provider value={controller}>
      {children}
    </MobileNavigationContext.Provider>
  );
}

export function useMobileNavigation() {
  const controller = useContext(MobileNavigationContext);
  if (!controller) {
    throw new Error(
      "useMobileNavigation must be used inside MobileNavigationProvider.",
    );
  }
  return controller;
}
