import * as authorization from '../model/authorization';
import * as capa from '../model/capa';
import * as capi from '../model/capi';
import * as capv from '../model/capv';
import * as capz from '../model/capz';
import * as crossplaneAWS from '../model/crossplane-aws';
import * as fluxcd from '../model/fluxcd';
import * as giantswarmApplication from '../model/giantswarm-application';
import * as giantswarmPlatform from '../model/giantswarm-platform';
import * as giantswarmSecurity from '../model/giantswarm-security';
import * as metav1 from '../model/metav1';
import * as externalSecrets from '../model/external-secrets';

export type App = giantswarmApplication.App;

export type Catalog = giantswarmApplication.Catalog;

export type Cluster = capi.Cluster;

export type ControlPlane = capi.KubeadmControlPlane;

export type Deployment = App | HelmRelease;

export type HelmRelease = fluxcd.HelmRelease;

export type List<T> = metav1.IList<T>;

export type Organization = giantswarmSecurity.Organization;

export type ProviderCluster =
  | capa.AWSCluster
  | capv.VSphereCluster
  | capz.AzureCluster;

export type ProviderConfig = crossplaneAWS.ProviderConfig;

export type SecretStore = externalSecrets.SecretStore;
export type ClusterSecretStore = externalSecrets.ClusterSecretStore;

export type ResourceRequest =
  | giantswarmPlatform.GitHubApp
  | giantswarmPlatform.GitHubRepo
  | giantswarmPlatform.AppDeployment;

export type ResourceObject = {
  apiVersion: string;
  kind: string;
  metadata: metav1.IObjectMeta;
};

export type Resource<T extends ResourceObject> = T & {
  installationName: string;
};

export type InstallationObjectRef = {
  installationName: string;
  apiVersion?: string;
  kind: string;
  name: string;
  namespace?: string;
};

export type LocalSubjectAccessReview = authorization.LocalSubjectAccessReview;

export type SelfSubjectAccessReview = authorization.SelfSubjectAccessReview;

export type SelfSubjectRulesReview = authorization.SelfSubjectRulesReview;
