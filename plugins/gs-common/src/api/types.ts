import * as applicationv1alpha1 from '../model/applicationv1alpha1';
import * as authorizationv1 from '../model/authorizationv1';
import * as capiv1beta1 from '../model/capiv1beta1';
import * as helmv2beta1 from '../model/helmv2beta1';
import * as metav1 from '../model/metav1';
import * as securityv1alpha1 from '../model/securityv1alpha1';

export type App = applicationv1alpha1.IApp;

export type Catalog = applicationv1alpha1.ICatalog;

export type Cluster = capiv1beta1.ICluster;

export type Deployment = App | HelmRelease;

export type HelmRelease = helmv2beta1.IHelmRelease;

export type List<T> = metav1.IList<T>;

export type Organization = securityv1alpha1.IOrganization;

export type Resource<T> = T & {
  installationName: string;
};

export type LocalSubjectAccessReview =
  authorizationv1.ILocalSubjectAccessReview;

export type SelfSubjectAccessReview = authorizationv1.ISelfSubjectAccessReview;

export type SelfSubjectRulesReview = authorizationv1.ISelfSubjectRulesReview;
