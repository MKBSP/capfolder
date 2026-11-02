import { MemoryFs } from "@capfolder/vault";
import { expect, test } from "vitest";
import { agentDeviceId } from "./context";

test("agentDeviceId is random per computer and kept in ~/.capfolder/device-id", async () => {
  const fs = new MemoryFs();
  const a = await agentDeviceId(fs, "/home/tim");
  expect(a).toMatch(/^dev_[0-9A-Z]{26}$/);
  expect(await agentDeviceId(fs, "/home/tim")).toBe(a);
  expect(await fs.readText("/home/tim/.capfolder/device-id")).toBe(a);
  expect(await agentDeviceId(new MemoryFs(), "/home/tim")).not.toBe(a);
});
