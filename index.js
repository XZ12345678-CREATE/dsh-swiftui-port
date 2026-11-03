// Standalone DSH plugin; package-local imports only.
import { definePlugin } from './lib/provider.js';
const plugin = definePlugin({ name: 'dsh-swiftui-port', skills: ["dsh-swiftui-port"], baseURL: new URL('.', import.meta.url) });
export const { name, inject, skillNames, createProvider } = plugin;
export function apply(ctx, config = {}) { plugin.apply(ctx, config);  }
