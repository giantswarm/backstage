import * as applicationv1alpha1 from '../model/applicationv1alpha1';
import * as capiv1beta1 from '../model/capiv1beta1';
import * as helmv2beta1 from '../model/helmv2beta1';
import * as metav1 from '../model/metav1';

export type App = applicationv1alpha1.IApp;

export type Catalog = applicationv1alpha1.ICatalog;

export type Cluster = capiv1beta1.ICluster;

export type Deployment = App | HelmRelease;

export type HelmRelease = helmv2beta1.IHelmRelease;

export type List<T> = metav1.IList<T>;

export type Resource<T> = T & {
  installationName: string;
};
