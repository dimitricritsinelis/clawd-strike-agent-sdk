import { resolveBaselineConfig } from "../src/runtime/config.mjs";
import { main } from "./self-improving-runner.mjs";
await main(await resolveBaselineConfig());
