import { describe, expect, it } from "vitest";
import { MemoryFs } from "./fs/memory";
import { loadRegistry, registerCompany, resolveFolder, setCurrent } from "./registry";

const FILE = "/h/.capfolder/companies.json";
describe("registry", () => {
  it("missing file gives an empty registry", async () => {
    expect(await loadRegistry(new MemoryFs(), "/h")).toEqual({ current: null, companies: [] });
  });
  it("registering twice keeps one entry; the latest becomes current", async () => {
    const fs = new MemoryFs();
    await registerCompany(fs, "/h", { name: "Acme", root: "/a" });
    await registerCompany(fs, "/h", { name: "Acme Inc", root: "/a" });
    const r = await registerCompany(fs, "/h", { name: "Bill Gates Inc", root: "/b" });
    expect(r.companies).toEqual([
      { name: "Acme Inc", root: "/a" },
      { name: "Bill Gates Inc", root: "/b" },
    ]);
    expect(r.current).toBe("/b");
    expect(await loadRegistry(fs, "/h")).toEqual(r);
    expect((await setCurrent(fs, "/h", "/a")).current).toBe("/a");
  });
  it("corrupt JSON gives empty and is rewritten on next register", async () => {
    const fs = new MemoryFs();
    fs.writeSync(FILE, "{nope");
    expect(await loadRegistry(fs, "/h")).toEqual({ current: null, companies: [] });
    await registerCompany(fs, "/h", { name: "Acme", root: "/a" });
    expect(JSON.parse(fs.readSync(FILE)).companies).toHaveLength(1);
  });
  it("resolveFolder expands ~ and leaves other paths", () => {
    expect(resolveFolder("~/Documents/Capfolder/Acme", "/Users/tim")).toBe(
      "/Users/tim/Documents/Capfolder/Acme",
    );
    expect(resolveFolder("C:\\Users\\tim\\Acme Inc", "/Users/tim")).toBe("C:\\Users\\tim\\Acme Inc");
  });
});
