export {
  gsPlugin,
  gsPlugin as plugin,
  GSPluginPage,
  EntityGSDeployedToContent,
} from './plugin';
export {
  gsAuthApiRefs,
  gsAuthProviderFactories,
  createScmAuthInstances
} from './apis';
export { ProviderSettings as GSProviderSettings } from './components/ProviderSettings'
export {
  // Router,
  isGSDeployedToAvailable,
  isGSDeployedToAvailable as isPluginApplicableToEntity,
} from './components/Router';
