import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.dreamhaus.vaivia",
  appName: "VAIVIA",
  webDir: "mobile/dist",
  backgroundColor: "#0c0115",
  loggingBehavior: "debug",
  ios: {
    backgroundColor: "#0c0115",
    contentInset: "never",
    preferredContentMode: "mobile",
    allowsLinkPreview: false,
    includePlugins: ["@capacitor/app", "@capacitor/browser"],
  },
};

export default config;
