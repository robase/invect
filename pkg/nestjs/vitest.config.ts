import { defineConfig, mergeConfig } from "vitest/config";
import { resolve } from "path";
import swc from "unplugin-swc";
import baseConfig from "../../vitest.base";

export default mergeConfig(
  baseConfig,
  defineConfig({
    plugins: [
      swc.vite({
        module: { type: "es6" },
      }),
    ],
    test: {
      root: "./src",
      setupFiles: ["./test/setup.ts"],
    },
    resolve: {
      alias: {
        "@": resolve(__dirname, "./src"),
      },
    },
  }),
);
