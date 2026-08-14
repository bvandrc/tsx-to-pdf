// biome-ignore lint/performance/noBarrelFile: this is the package's published surface, not an internal barrel
export { build } from './build.ts'
export {
  type Config,
  findConfig,
  loadConfig,
  type Margin,
  PAGE_SIZES,
  type PageDimensions,
  type PageSize,
  type ResolvedConfig,
} from './config.ts'
export { serve } from './dev-server.tsx'
