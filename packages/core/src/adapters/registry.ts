import type { CapabilityManifest, RuntimeAdapter } from "./contract";

/** Loads adapters by manifest and routes Agent Task nodes to them. */
export class RuntimeAdapterRegistry {
  private adapters = new Map<string, RuntimeAdapter>();

  register(adapter: RuntimeAdapter): this {
    const id = adapter.manifest.id;
    if (this.adapters.has(id)) throw new Error(`Runtime adapter "${id}" is already registered`);
    this.adapters.set(id, adapter);
    return this;
  }

  get(id: string): RuntimeAdapter | undefined {
    return this.adapters.get(id);
  }

  require(id: string): RuntimeAdapter {
    const a = this.adapters.get(id);
    if (!a) throw new Error(`No runtime adapter registered for "${id}"`);
    return a;
  }

  manifests(): CapabilityManifest[] {
    return [...this.adapters.values()].map((a) => a.manifest);
  }
}
