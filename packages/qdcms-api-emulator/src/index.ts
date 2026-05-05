/**
 * @quazardous/qdcms-api-emulator
 *
 * Browser-side fetch interceptor for qdcms HTTP routes. Pair with
 * a backend (qdcms-backend in-process, or any handle-shaped object)
 * and the consumer's qdcms-frontend code talks to it as if it were
 * a real server — without any network.
 *
 * See `./installEmulator.ts` for the API.
 */

export {
  installEmulator,
  type EmulatorBackend,
  type InstallEmulatorOptions,
  type EmulatorHandle,
} from './installEmulator'
