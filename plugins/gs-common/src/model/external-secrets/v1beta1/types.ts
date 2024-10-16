/**
 * This file was automatically generated, PLEASE DO NOT MODIFY IT BY HAND.
 */

import * as metav1 from '../../metav1';

/**
 * SecretStore represents a secure external location for storing secrets, which can be referenced as part of `storeRef` fields.
 */
export interface ISecretStore {
  /**
   * APIVersion defines the versioned schema of this representation of an object.
   * Servers should convert recognized schemas to the latest internal value, and
   * may reject unrecognized values.
   * More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#resources
   */
  apiVersion: 'v1beta1';
  /**
   * Kind is a string value representing the REST resource this object represents.
   * Servers may infer this from the endpoint the client submits requests to.
   * Cannot be updated.
   * In CamelCase.
   * More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#types-kinds
   */
  kind: 'SecretStore';
  metadata: metav1.IObjectMeta;
  /**
   * SecretStoreSpec defines the desired state of SecretStore.
   */
  spec?: {
    /**
     * Used to constraint a ClusterSecretStore to specific namespaces. Relevant only to ClusterSecretStore
     */
    conditions?: {
      /**
       * Choose namespaces by using regex matching
       */
      namespaceRegexes?: string[];
      /**
       * Choose namespace using a labelSelector
       */
      namespaceSelector?: {
        /**
         * matchExpressions is a list of label selector requirements. The requirements are ANDed.
         */
        matchExpressions?: {
          /**
           * key is the label key that the selector applies to.
           */
          key: string;
          /**
           * operator represents a key's relationship to a set of values.
           * Valid operators are In, NotIn, Exists and DoesNotExist.
           */
          operator: string;
          /**
           * values is an array of string values. If the operator is In or NotIn,
           * the values array must be non-empty. If the operator is Exists or DoesNotExist,
           * the values array must be empty. This array is replaced during a strategic
           * merge patch.
           */
          values?: string[];
        }[];
        /**
         * matchLabels is a map of {key,value} pairs. A single {key,value} in the matchLabels
         * map is equivalent to an element of matchExpressions, whose key field is "key", the
         * operator is "In", and the values array contains only "value". The requirements are ANDed.
         */
        matchLabels?: {
          [k: string]: string;
        };
      };
      /**
       * Choose namespaces by name
       */
      namespaces?: string[];
    }[];
    /**
     * Used to select the correct ESO controller (think: ingress.ingressClassName)
     * The ESO controller is instantiated with a specific controller name and filters ES based on this property
     */
    controller?: string;
    /**
     * Used to configure the provider. Only one provider may be set
     */
    provider: {
      /**
       * Akeyless configures this store to sync secrets using Akeyless Vault provider
       */
      akeyless?: {
        /**
         * Akeyless GW API Url from which the secrets to be fetched from.
         */
        akeylessGWApiURL: string;
        /**
         * Auth configures how the operator authenticates with Akeyless.
         */
        authSecretRef: {
          /**
           * Kubernetes authenticates with Akeyless by passing the ServiceAccount
           * token stored in the named Secret resource.
           */
          kubernetesAuth?: {
            /**
             * the Akeyless Kubernetes auth-method access-id
             */
            accessID: string;
            /**
             * Kubernetes-auth configuration name in Akeyless-Gateway
             */
            k8sConfName: string;
            /**
             * Optional secret field containing a Kubernetes ServiceAccount JWT used
             * for authenticating with Akeyless. If a name is specified without a key,
             * `token` is the default. If one is not specified, the one bound to
             * the controller will be used.
             */
            secretRef?: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
            /**
             * Optional service account field containing the name of a kubernetes ServiceAccount.
             * If the service account is specified, the service account secret token JWT will be used
             * for authenticating with Akeyless. If the service account selector is not supplied,
             * the secretRef will be used instead.
             */
            serviceAccountRef?: {
              /**
               * Audience specifies the `aud` claim for the service account token
               * If the service account uses a well-known annotation for e.g. IRSA or GCP Workload Identity
               * then this audiences will be appended to the list
               */
              audiences?: string[];
              /**
               * The name of the ServiceAccount resource being referred to.
               */
              name: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
          };
          /**
           * Reference to a Secret that contains the details
           * to authenticate with Akeyless.
           */
          secretRef?: {
            /**
             * The SecretAccessID is used for authentication
             */
            accessID?: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
            /**
             * A reference to a specific 'key' within a Secret resource,
             * In some instances, `key` is a required field.
             */
            accessType?: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
            /**
             * A reference to a specific 'key' within a Secret resource,
             * In some instances, `key` is a required field.
             */
            accessTypeParam?: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
          };
        };
        /**
         * PEM/base64 encoded CA bundle used to validate Akeyless Gateway certificate. Only used
         * if the AkeylessGWApiURL URL is using HTTPS protocol. If not set the system root certificates
         * are used to validate the TLS connection.
         */
        caBundle?: string;
        /**
         * The provider for the CA bundle to use to validate Akeyless Gateway certificate.
         */
        caProvider?: {
          /**
           * The key where the CA certificate can be found in the Secret or ConfigMap.
           */
          key?: string;
          /**
           * The name of the object located at the provider type.
           */
          name: string;
          /**
           * The namespace the Provider type is in.
           * Can only be defined when used in a ClusterSecretStore.
           */
          namespace?: string;
          /**
           * The type of provider to use such as "Secret", or "ConfigMap".
           */
          type: 'Secret' | 'ConfigMap';
        };
      };
      /**
       * Alibaba configures this store to sync secrets using Alibaba Cloud provider
       */
      alibaba?: {
        /**
         * AlibabaAuth contains a secretRef for credentials.
         */
        auth: {
          /**
           * Authenticate against Alibaba using RRSA.
           */
          rrsa?: {
            oidcProviderArn: string;
            oidcTokenFilePath: string;
            roleArn: string;
            sessionName: string;
          };
          /**
           * AlibabaAuthSecretRef holds secret references for Alibaba credentials.
           */
          secretRef?: {
            /**
             * The AccessKeyID is used for authentication
             */
            accessKeyIDSecretRef: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
            /**
             * The AccessKeySecret is used for authentication
             */
            accessKeySecretSecretRef: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
          };
        };
        /**
         * Alibaba Region to be used for the provider
         */
        regionID: string;
      };
      /**
       * AWS configures this store to sync secrets using AWS Secret Manager provider
       */
      aws?: {
        /**
         * AdditionalRoles is a chained list of Role ARNs which the provider will sequentially assume before assuming the Role
         */
        additionalRoles?: string[];
        /**
         * Auth defines the information necessary to authenticate against AWS
         * if not set aws sdk will infer credentials from your environment
         * see: https://docs.aws.amazon.com/sdk-for-go/v1/developer-guide/configuring-sdk.html#specifying-credentials
         */
        auth?: {
          /**
           * Authenticate against AWS using service account tokens.
           */
          jwt?: {
            /**
             * A reference to a ServiceAccount resource.
             */
            serviceAccountRef?: {
              /**
               * Audience specifies the `aud` claim for the service account token
               * If the service account uses a well-known annotation for e.g. IRSA or GCP Workload Identity
               * then this audiences will be appended to the list
               */
              audiences?: string[];
              /**
               * The name of the ServiceAccount resource being referred to.
               */
              name: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
          };
          /**
           * AWSAuthSecretRef holds secret references for AWS credentials
           * both AccessKeyID and SecretAccessKey must be defined in order to properly authenticate.
           */
          secretRef?: {
            /**
             * The AccessKeyID is used for authentication
             */
            accessKeyIDSecretRef?: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
            /**
             * The SecretAccessKey is used for authentication
             */
            secretAccessKeySecretRef?: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
            /**
             * The SessionToken used for authentication
             * This must be defined if AccessKeyID and SecretAccessKey are temporary credentials
             * see: https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_temp_use-resources.html
             */
            sessionTokenSecretRef?: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
          };
        };
        /**
         * AWS External ID set on assumed IAM roles
         */
        externalID?: string;
        /**
         * Prefix adds a prefix to all retrieved values.
         */
        prefix?: string;
        /**
         * AWS Region to be used for the provider
         */
        region: string;
        /**
         * Role is a Role ARN which the provider will assume
         */
        role?: string;
        /**
         * SecretsManager defines how the provider behaves when interacting with AWS SecretsManager
         */
        secretsManager?: {
          /**
           * Specifies whether to delete the secret without any recovery window. You
           * can't use both this parameter and RecoveryWindowInDays in the same call.
           * If you don't use either, then by default Secrets Manager uses a 30 day
           * recovery window.
           * see: https://docs.aws.amazon.com/secretsmanager/latest/apireference/API_DeleteSecret.html#SecretsManager-DeleteSecret-request-ForceDeleteWithoutRecovery
           */
          forceDeleteWithoutRecovery?: boolean;
          /**
           * The number of days from 7 to 30 that Secrets Manager waits before
           * permanently deleting the secret. You can't use both this parameter and
           * ForceDeleteWithoutRecovery in the same call. If you don't use either,
           * then by default Secrets Manager uses a 30 day recovery window.
           * see: https://docs.aws.amazon.com/secretsmanager/latest/apireference/API_DeleteSecret.html#SecretsManager-DeleteSecret-request-RecoveryWindowInDays
           */
          recoveryWindowInDays?: number;
        };
        /**
         * Service defines which service should be used to fetch the secrets
         */
        service: 'SecretsManager' | 'ParameterStore';
        /**
         * AWS STS assume role session tags
         */
        sessionTags?: {
          key: string;
          value: string;
        }[];
        /**
         * AWS STS assume role transitive session tags. Required when multiple rules are used with the provider
         */
        transitiveTagKeys?: string[];
      };
      /**
       * AzureKV configures this store to sync secrets using Azure Key Vault provider
       */
      azurekv?: {
        /**
         * Auth configures how the operator authenticates with Azure. Required for ServicePrincipal auth type. Optional for WorkloadIdentity.
         */
        authSecretRef?: {
          /**
           * The Azure ClientCertificate of the service principle used for authentication.
           */
          clientCertificate?: {
            /**
             * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
             * defaulted, in others it may be required.
             */
            key?: string;
            /**
             * The name of the Secret resource being referred to.
             */
            name?: string;
            /**
             * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
             * to the namespace of the referent.
             */
            namespace?: string;
          };
          /**
           * The Azure clientId of the service principle or managed identity used for authentication.
           */
          clientId?: {
            /**
             * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
             * defaulted, in others it may be required.
             */
            key?: string;
            /**
             * The name of the Secret resource being referred to.
             */
            name?: string;
            /**
             * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
             * to the namespace of the referent.
             */
            namespace?: string;
          };
          /**
           * The Azure ClientSecret of the service principle used for authentication.
           */
          clientSecret?: {
            /**
             * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
             * defaulted, in others it may be required.
             */
            key?: string;
            /**
             * The name of the Secret resource being referred to.
             */
            name?: string;
            /**
             * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
             * to the namespace of the referent.
             */
            namespace?: string;
          };
          /**
           * The Azure tenantId of the managed identity used for authentication.
           */
          tenantId?: {
            /**
             * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
             * defaulted, in others it may be required.
             */
            key?: string;
            /**
             * The name of the Secret resource being referred to.
             */
            name?: string;
            /**
             * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
             * to the namespace of the referent.
             */
            namespace?: string;
          };
        };
        /**
         * Auth type defines how to authenticate to the keyvault service.
         * Valid values are:
         * - "ServicePrincipal" (default): Using a service principal (tenantId, clientId, clientSecret)
         * - "ManagedIdentity": Using Managed Identity assigned to the pod (see aad-pod-identity)
         */
        authType?: 'ServicePrincipal' | 'ManagedIdentity' | 'WorkloadIdentity';
        /**
         * EnvironmentType specifies the Azure cloud environment endpoints to use for
         * connecting and authenticating with Azure. By default it points to the public cloud AAD endpoint.
         * The following endpoints are available, also see here: https://github.com/Azure/go-autorest/blob/main/autorest/azure/environments.go#L152
         * PublicCloud, USGovernmentCloud, ChinaCloud, GermanCloud
         */
        environmentType?:
          | 'PublicCloud'
          | 'USGovernmentCloud'
          | 'ChinaCloud'
          | 'GermanCloud';
        /**
         * If multiple Managed Identity is assigned to the pod, you can select the one to be used
         */
        identityId?: string;
        /**
         * ServiceAccountRef specified the service account
         * that should be used when authenticating with WorkloadIdentity.
         */
        serviceAccountRef?: {
          /**
           * Audience specifies the `aud` claim for the service account token
           * If the service account uses a well-known annotation for e.g. IRSA or GCP Workload Identity
           * then this audiences will be appended to the list
           */
          audiences?: string[];
          /**
           * The name of the ServiceAccount resource being referred to.
           */
          name: string;
          /**
           * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
           * to the namespace of the referent.
           */
          namespace?: string;
        };
        /**
         * TenantID configures the Azure Tenant to send requests to. Required for ServicePrincipal auth type. Optional for WorkloadIdentity.
         */
        tenantId?: string;
        /**
         * Vault Url from which the secrets to be fetched from.
         */
        vaultUrl: string;
      };
      /**
       * Beyondtrust configures this store to sync secrets using Password Safe provider.
       */
      beyondtrust?: {
        /**
         * Auth configures how the operator authenticates with Beyondtrust.
         */
        auth: {
          /**
           * Content of the certificate (cert.pem) for use when authenticating with an OAuth client Id using a Client Certificate.
           */
          certificate?: {
            /**
             * SecretRef references a key in a secret that will be used as value.
             */
            secretRef?: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
            /**
             * Value can be specified directly to set a value without using a secret.
             */
            value?: string;
          };
          /**
           * Certificate private key (key.pem). For use when authenticating with an OAuth client Id
           */
          certificateKey?: {
            /**
             * SecretRef references a key in a secret that will be used as value.
             */
            secretRef?: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
            /**
             * Value can be specified directly to set a value without using a secret.
             */
            value?: string;
          };
          clientId: {
            /**
             * SecretRef references a key in a secret that will be used as value.
             */
            secretRef?: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
            /**
             * Value can be specified directly to set a value without using a secret.
             */
            value?: string;
          };
          clientSecret: {
            /**
             * SecretRef references a key in a secret that will be used as value.
             */
            secretRef?: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
            /**
             * Value can be specified directly to set a value without using a secret.
             */
            value?: string;
          };
        };
        /**
         * Auth configures how API server works.
         */
        server: {
          apiUrl: string;
          /**
           * Timeout specifies a time limit for requests made by this Client. The timeout includes connection time, any redirects, and reading the response body. Defaults to 45 seconds.
           */
          clientTimeOutSeconds?: number;
          /**
           * The secret retrieval type. SECRET = Secrets Safe (credential, text, file). MANAGED_ACCOUNT = Password Safe account associated with a system.
           */
          retrievalType?: string;
          /**
           * A character that separates the folder names.
           */
          separator?: string;
          verifyCA: boolean;
        };
      };
      /**
       * BitwardenSecretsManager configures this store to sync secrets using BitwardenSecretsManager provider
       */
      bitwardensecretsmanager?: {
        apiURL?: string;
        /**
         * Auth configures how secret-manager authenticates with a bitwarden machine account instance.
         * Make sure that the token being used has permissions on the given secret.
         */
        auth: {
          /**
           * BitwardenSecretsManagerSecretRef contains the credential ref to the bitwarden instance.
           */
          secretRef: {
            /**
             * AccessToken used for the bitwarden instance.
             */
            credentials: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
          };
        };
        bitwardenServerSDKURL?: string;
        /**
         * Base64 encoded certificate for the bitwarden server sdk. The sdk MUST run with HTTPS to make sure no MITM attack
         * can be performed.
         */
        caBundle?: string;
        /**
         * see: https://external-secrets.io/latest/spec/#external-secrets.io/v1alpha1.CAProvider
         */
        caProvider?: {
          /**
           * The key where the CA certificate can be found in the Secret or ConfigMap.
           */
          key?: string;
          /**
           * The name of the object located at the provider type.
           */
          name: string;
          /**
           * The namespace the Provider type is in.
           * Can only be defined when used in a ClusterSecretStore.
           */
          namespace?: string;
          /**
           * The type of provider to use such as "Secret", or "ConfigMap".
           */
          type: 'Secret' | 'ConfigMap';
        };
        identityURL?: string;
        /**
         * OrganizationID determines which organization this secret store manages.
         */
        organizationID: string;
        /**
         * ProjectID determines which project this secret store manages.
         */
        projectID: string;
      };
      /**
       * Chef configures this store to sync secrets with chef server
       */
      chef?: {
        /**
         * Auth defines the information necessary to authenticate against chef Server
         */
        auth: {
          /**
           * ChefAuthSecretRef holds secret references for chef server login credentials.
           */
          secretRef: {
            /**
             * SecretKey is the Signing Key in PEM format, used for authentication.
             */
            privateKeySecretRef: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
          };
        };
        /**
         * ServerURL is the chef server URL used to connect to. If using orgs you should include your org in the url and terminate the url with a "/"
         */
        serverUrl: string;
        /**
         * UserName should be the user ID on the chef server
         */
        username: string;
      };
      /**
       * Conjur configures this store to sync secrets using conjur provider
       */
      conjur?: {
        auth: {
          apikey?: {
            account: string;
            /**
             * A reference to a specific 'key' within a Secret resource,
             * In some instances, `key` is a required field.
             */
            apiKeyRef: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
            /**
             * A reference to a specific 'key' within a Secret resource,
             * In some instances, `key` is a required field.
             */
            userRef: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
          };
          jwt?: {
            account: string;
            /**
             * Optional HostID for JWT authentication. This may be used depending
             * on how the Conjur JWT authenticator policy is configured.
             */
            hostId?: string;
            /**
             * Optional SecretRef that refers to a key in a Secret resource containing JWT token to
             * authenticate with Conjur using the JWT authentication method.
             */
            secretRef?: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
            /**
             * Optional ServiceAccountRef specifies the Kubernetes service account for which to request
             * a token for with the `TokenRequest` API.
             */
            serviceAccountRef?: {
              /**
               * Audience specifies the `aud` claim for the service account token
               * If the service account uses a well-known annotation for e.g. IRSA or GCP Workload Identity
               * then this audiences will be appended to the list
               */
              audiences?: string[];
              /**
               * The name of the ServiceAccount resource being referred to.
               */
              name: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
            /**
             * The conjur authn jwt webservice id
             */
            serviceID: string;
          };
        };
        caBundle?: string;
        /**
         * Used to provide custom certificate authority (CA) certificates
         * for a secret store. The CAProvider points to a Secret or ConfigMap resource
         * that contains a PEM-encoded certificate.
         */
        caProvider?: {
          /**
           * The key where the CA certificate can be found in the Secret or ConfigMap.
           */
          key?: string;
          /**
           * The name of the object located at the provider type.
           */
          name: string;
          /**
           * The namespace the Provider type is in.
           * Can only be defined when used in a ClusterSecretStore.
           */
          namespace?: string;
          /**
           * The type of provider to use such as "Secret", or "ConfigMap".
           */
          type: 'Secret' | 'ConfigMap';
        };
        url: string;
      };
      /**
       * Delinea DevOps Secrets Vault
       * https://docs.delinea.com/online-help/products/devops-secrets-vault/current
       */
      delinea?: {
        /**
         * ClientID is the non-secret part of the credential.
         */
        clientId: {
          /**
           * SecretRef references a key in a secret that will be used as value.
           */
          secretRef?: {
            /**
             * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
             * defaulted, in others it may be required.
             */
            key?: string;
            /**
             * The name of the Secret resource being referred to.
             */
            name?: string;
            /**
             * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
             * to the namespace of the referent.
             */
            namespace?: string;
          };
          /**
           * Value can be specified directly to set a value without using a secret.
           */
          value?: string;
        };
        /**
         * ClientSecret is the secret part of the credential.
         */
        clientSecret: {
          /**
           * SecretRef references a key in a secret that will be used as value.
           */
          secretRef?: {
            /**
             * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
             * defaulted, in others it may be required.
             */
            key?: string;
            /**
             * The name of the Secret resource being referred to.
             */
            name?: string;
            /**
             * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
             * to the namespace of the referent.
             */
            namespace?: string;
          };
          /**
           * Value can be specified directly to set a value without using a secret.
           */
          value?: string;
        };
        /**
         * Tenant is the chosen hostname / site name.
         */
        tenant: string;
        /**
         * TLD is based on the server location that was chosen during provisioning.
         * If unset, defaults to "com".
         */
        tld?: string;
        /**
         * URLTemplate
         * If unset, defaults to "https://%s.secretsvaultcloud.%s/v1/%s%s".
         */
        urlTemplate?: string;
      };
      /**
       * Device42 configures this store to sync secrets using the Device42 provider
       */
      device42?: {
        /**
         * Auth configures how secret-manager authenticates with a Device42 instance.
         */
        auth: {
          secretRef: {
            /**
             * Username / Password is used for authentication.
             */
            credentials?: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
          };
        };
        /**
         * URL configures the Device42 instance URL.
         */
        host: string;
      };
      /**
       * Doppler configures this store to sync secrets using the Doppler provider
       */
      doppler?: {
        /**
         * Auth configures how the Operator authenticates with the Doppler API
         */
        auth: {
          secretRef: {
            /**
             * The DopplerToken is used for authentication.
             * See https://docs.doppler.com/reference/api#authentication for auth token types.
             * The Key attribute defaults to dopplerToken if not specified.
             */
            dopplerToken: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
          };
        };
        /**
         * Doppler config (required if not using a Service Token)
         */
        config?: string;
        /**
         * Format enables the downloading of secrets as a file (string)
         */
        format?: 'json' | 'dotnet-json' | 'env' | 'yaml' | 'docker';
        /**
         * Environment variable compatible name transforms that change secret names to a different format
         */
        nameTransformer?:
          | 'upper-camel'
          | 'camel'
          | 'lower-snake'
          | 'tf-var'
          | 'dotnet-env'
          | 'lower-kebab';
        /**
         * Doppler project (required if not using a Service Token)
         */
        project?: string;
      };
      /**
       * Fake configures a store with static key/value pairs
       */
      fake?: {
        data: {
          key: string;
          value?: string;
          /**
           * Deprecated: ValueMap is deprecated and is intended to be removed in the future, use the `value` field instead.
           */
          valueMap?: {
            [k: string]: string;
          };
          version?: string;
        }[];
      };
      /**
       * Fortanix configures this store to sync secrets using the Fortanix provider
       */
      fortanix?: {
        /**
         * APIKey is the API token to access SDKMS Applications.
         */
        apiKey?: {
          /**
           * SecretRef is a reference to a secret containing the SDKMS API Key.
           */
          secretRef?: {
            /**
             * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
             * defaulted, in others it may be required.
             */
            key?: string;
            /**
             * The name of the Secret resource being referred to.
             */
            name?: string;
            /**
             * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
             * to the namespace of the referent.
             */
            namespace?: string;
          };
        };
        /**
         * APIURL is the URL of SDKMS API. Defaults to `sdkms.fortanix.com`.
         */
        apiUrl?: string;
      };
      /**
       * GCPSM configures this store to sync secrets using Google Cloud Platform Secret Manager provider
       */
      gcpsm?: {
        /**
         * Auth defines the information necessary to authenticate against GCP
         */
        auth?: {
          secretRef?: {
            /**
             * The SecretAccessKey is used for authentication
             */
            secretAccessKeySecretRef?: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
          };
          workloadIdentity?: {
            clusterLocation: string;
            clusterName: string;
            clusterProjectID?: string;
            /**
             * A reference to a ServiceAccount resource.
             */
            serviceAccountRef: {
              /**
               * Audience specifies the `aud` claim for the service account token
               * If the service account uses a well-known annotation for e.g. IRSA or GCP Workload Identity
               * then this audiences will be appended to the list
               */
              audiences?: string[];
              /**
               * The name of the ServiceAccount resource being referred to.
               */
              name: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
          };
        };
        /**
         * Location optionally defines a location for a secret
         */
        location?: string;
        /**
         * ProjectID project where secret is located
         */
        projectID?: string;
      };
      /**
       * GitLab configures this store to sync secrets using GitLab Variables provider
       */
      gitlab?: {
        /**
         * Auth configures how secret-manager authenticates with a GitLab instance.
         */
        auth: {
          SecretRef: {
            /**
             * AccessToken is used for authentication.
             */
            accessToken?: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
          };
        };
        /**
         * Environment environment_scope of gitlab CI/CD variables (Please see https://docs.gitlab.com/ee/ci/environments/#create-a-static-environment on how to create environments)
         */
        environment?: string;
        /**
         * GroupIDs specify, which gitlab groups to pull secrets from. Group secrets are read from left to right followed by the project variables.
         */
        groupIDs?: string[];
        /**
         * InheritFromGroups specifies whether parent groups should be discovered and checked for secrets.
         */
        inheritFromGroups?: boolean;
        /**
         * ProjectID specifies a project where secrets are located.
         */
        projectID?: string;
        /**
         * URL configures the GitLab instance URL. Defaults to https://gitlab.com/.
         */
        url?: string;
      };
      /**
       * IBM configures this store to sync secrets using IBM Cloud provider
       */
      ibm?: {
        /**
         * Auth configures how secret-manager authenticates with the IBM secrets manager.
         */
        auth: {
          /**
           * IBM Container-based auth with IAM Trusted Profile.
           */
          containerAuth?: {
            iamEndpoint?: string;
            /**
             * the IBM Trusted Profile
             */
            profile: string;
            /**
             * Location the token is mounted on the pod
             */
            tokenLocation?: string;
          };
          secretRef?: {
            /**
             * The SecretAccessKey is used for authentication
             */
            secretApiKeySecretRef?: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
          };
        };
        /**
         * ServiceURL is the Endpoint URL that is specific to the Secrets Manager service instance
         */
        serviceUrl?: string;
      };
      /**
       * Infisical configures this store to sync secrets using the Infisical provider
       */
      infisical?: {
        /**
         * Auth configures how the Operator authenticates with the Infisical API
         */
        auth: {
          universalAuthCredentials?: {
            /**
             * A reference to a specific 'key' within a Secret resource,
             * In some instances, `key` is a required field.
             */
            clientId: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
            /**
             * A reference to a specific 'key' within a Secret resource,
             * In some instances, `key` is a required field.
             */
            clientSecret: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
          };
        };
        hostAPI?: string;
        secretsScope: {
          environmentSlug: string;
          projectSlug: string;
          recursive?: boolean;
          secretsPath?: string;
        };
      };
      /**
       * KeeperSecurity configures this store to sync secrets using the KeeperSecurity provider
       */
      keepersecurity?: {
        /**
         * A reference to a specific 'key' within a Secret resource,
         * In some instances, `key` is a required field.
         */
        authRef: {
          /**
           * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
           * defaulted, in others it may be required.
           */
          key?: string;
          /**
           * The name of the Secret resource being referred to.
           */
          name?: string;
          /**
           * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
           * to the namespace of the referent.
           */
          namespace?: string;
        };
        folderID: string;
      };
      /**
       * Kubernetes configures this store to sync secrets using a Kubernetes cluster provider
       */
      kubernetes?: {
        /**
         * Auth configures how secret-manager authenticates with a Kubernetes instance.
         */
        auth?: {
          /**
           * has both clientCert and clientKey as secretKeySelector
           */
          cert?: {
            /**
             * A reference to a specific 'key' within a Secret resource,
             * In some instances, `key` is a required field.
             */
            clientCert?: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
            /**
             * A reference to a specific 'key' within a Secret resource,
             * In some instances, `key` is a required field.
             */
            clientKey?: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
          };
          /**
           * points to a service account that should be used for authentication
           */
          serviceAccount?: {
            /**
             * Audience specifies the `aud` claim for the service account token
             * If the service account uses a well-known annotation for e.g. IRSA or GCP Workload Identity
             * then this audiences will be appended to the list
             */
            audiences?: string[];
            /**
             * The name of the ServiceAccount resource being referred to.
             */
            name: string;
            /**
             * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
             * to the namespace of the referent.
             */
            namespace?: string;
          };
          /**
           * use static token to authenticate with
           */
          token?: {
            /**
             * A reference to a specific 'key' within a Secret resource,
             * In some instances, `key` is a required field.
             */
            bearerToken?: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
          };
        };
        /**
         * A reference to a secret that contains the auth information.
         */
        authRef?: {
          /**
           * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
           * defaulted, in others it may be required.
           */
          key?: string;
          /**
           * The name of the Secret resource being referred to.
           */
          name?: string;
          /**
           * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
           * to the namespace of the referent.
           */
          namespace?: string;
        };
        /**
         * Remote namespace to fetch the secrets from
         */
        remoteNamespace?: string;
        /**
         * configures the Kubernetes server Address.
         */
        server?: {
          /**
           * CABundle is a base64-encoded CA certificate
           */
          caBundle?: string;
          /**
           * see: https://external-secrets.io/v0.4.1/spec/#external-secrets.io/v1alpha1.CAProvider
           */
          caProvider?: {
            /**
             * The key where the CA certificate can be found in the Secret or ConfigMap.
             */
            key?: string;
            /**
             * The name of the object located at the provider type.
             */
            name: string;
            /**
             * The namespace the Provider type is in.
             * Can only be defined when used in a ClusterSecretStore.
             */
            namespace?: string;
            /**
             * The type of provider to use such as "Secret", or "ConfigMap".
             */
            type: 'Secret' | 'ConfigMap';
          };
          /**
           * configures the Kubernetes server Address.
           */
          url?: string;
        };
      };
      /**
       * Onboardbase configures this store to sync secrets using the Onboardbase provider
       */
      onboardbase?: {
        /**
         * APIHost use this to configure the host url for the API for selfhosted installation, default is https://public.onboardbase.com/api/v1/
         */
        apiHost: string;
        /**
         * Auth configures how the Operator authenticates with the Onboardbase API
         */
        auth: {
          /**
           * OnboardbaseAPIKey is the APIKey generated by an admin account.
           * It is used to recognize and authorize access to a project and environment within onboardbase
           */
          apiKeyRef: {
            /**
             * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
             * defaulted, in others it may be required.
             */
            key?: string;
            /**
             * The name of the Secret resource being referred to.
             */
            name?: string;
            /**
             * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
             * to the namespace of the referent.
             */
            namespace?: string;
          };
          /**
           * OnboardbasePasscode is the passcode attached to the API Key
           */
          passcodeRef: {
            /**
             * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
             * defaulted, in others it may be required.
             */
            key?: string;
            /**
             * The name of the Secret resource being referred to.
             */
            name?: string;
            /**
             * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
             * to the namespace of the referent.
             */
            namespace?: string;
          };
        };
        /**
         * Environment is the name of an environmnent within a project to pull the secrets from
         */
        environment: string;
        /**
         * Project is an onboardbase project that the secrets should be pulled from
         */
        project: string;
      };
      /**
       * OnePassword configures this store to sync secrets using the 1Password Cloud provider
       */
      onepassword?: {
        /**
         * Auth defines the information necessary to authenticate against OnePassword Connect Server
         */
        auth: {
          /**
           * OnePasswordAuthSecretRef holds secret references for 1Password credentials.
           */
          secretRef: {
            /**
             * The ConnectToken is used for authentication to a 1Password Connect Server.
             */
            connectTokenSecretRef: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
          };
        };
        /**
         * ConnectHost defines the OnePassword Connect Server to connect to
         */
        connectHost: string;
        /**
         * Vaults defines which OnePassword vaults to search in which order
         */
        vaults: {
          [k: string]: number;
        };
      };
      /**
       * Oracle configures this store to sync secrets using Oracle Vault provider
       */
      oracle?: {
        /**
         * Auth configures how secret-manager authenticates with the Oracle Vault.
         * If empty, use the instance principal, otherwise the user credentials specified in Auth.
         */
        auth?: {
          /**
           * SecretRef to pass through sensitive information.
           */
          secretRef: {
            /**
             * Fingerprint is the fingerprint of the API private key.
             */
            fingerprint: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
            /**
             * PrivateKey is the user's API Signing Key in PEM format, used for authentication.
             */
            privatekey: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
          };
          /**
           * Tenancy is the tenancy OCID where user is located.
           */
          tenancy: string;
          /**
           * User is an access OCID specific to the account.
           */
          user: string;
        };
        /**
         * Compartment is the vault compartment OCID.
         * Required for PushSecret
         */
        compartment?: string;
        /**
         * EncryptionKey is the OCID of the encryption key within the vault.
         * Required for PushSecret
         */
        encryptionKey?: string;
        /**
         * The type of principal to use for authentication. If left blank, the Auth struct will
         * determine the principal type. This optional field must be specified if using
         * workload identity.
         */
        principalType?: '' | 'UserPrincipal' | 'InstancePrincipal' | 'Workload';
        /**
         * Region is the region where vault is located.
         */
        region: string;
        /**
         * ServiceAccountRef specified the service account
         * that should be used when authenticating with WorkloadIdentity.
         */
        serviceAccountRef?: {
          /**
           * Audience specifies the `aud` claim for the service account token
           * If the service account uses a well-known annotation for e.g. IRSA or GCP Workload Identity
           * then this audiences will be appended to the list
           */
          audiences?: string[];
          /**
           * The name of the ServiceAccount resource being referred to.
           */
          name: string;
          /**
           * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
           * to the namespace of the referent.
           */
          namespace?: string;
        };
        /**
         * Vault is the vault's OCID of the specific vault where secret is located.
         */
        vault: string;
      };
      passbolt?: {
        /**
         * Auth defines the information necessary to authenticate against Passbolt Server
         */
        auth: {
          /**
           * A reference to a specific 'key' within a Secret resource,
           * In some instances, `key` is a required field.
           */
          passwordSecretRef: {
            /**
             * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
             * defaulted, in others it may be required.
             */
            key?: string;
            /**
             * The name of the Secret resource being referred to.
             */
            name?: string;
            /**
             * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
             * to the namespace of the referent.
             */
            namespace?: string;
          };
          /**
           * A reference to a specific 'key' within a Secret resource,
           * In some instances, `key` is a required field.
           */
          privateKeySecretRef: {
            /**
             * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
             * defaulted, in others it may be required.
             */
            key?: string;
            /**
             * The name of the Secret resource being referred to.
             */
            name?: string;
            /**
             * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
             * to the namespace of the referent.
             */
            namespace?: string;
          };
        };
        /**
         * Host defines the Passbolt Server to connect to
         */
        host: string;
      };
      /**
       * Configures a store to sync secrets with a Password Depot instance.
       */
      passworddepot?: {
        /**
         * Auth configures how secret-manager authenticates with a Password Depot instance.
         */
        auth: {
          secretRef: {
            /**
             * Username / Password is used for authentication.
             */
            credentials?: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
          };
        };
        /**
         * Database to use as source
         */
        database: string;
        /**
         * URL configures the Password Depot instance URL.
         */
        host: string;
      };
      /**
       * Previder configures this store to sync secrets using the Previder provider
       */
      previder?: {
        /**
         * PreviderAuth contains a secretRef for credentials.
         */
        auth: {
          /**
           * PreviderAuthSecretRef holds secret references for Previder Vault credentials.
           */
          secretRef?: {
            /**
             * The AccessToken is used for authentication
             */
            accessToken: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
          };
        };
        baseUri?: string;
      };
      /**
       * Pulumi configures this store to sync secrets using the Pulumi provider
       */
      pulumi?: {
        /**
         * AccessToken is the access tokens to sign in to the Pulumi Cloud Console.
         */
        accessToken: {
          /**
           * SecretRef is a reference to a secret containing the Pulumi API token.
           */
          secretRef?: {
            /**
             * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
             * defaulted, in others it may be required.
             */
            key?: string;
            /**
             * The name of the Secret resource being referred to.
             */
            name?: string;
            /**
             * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
             * to the namespace of the referent.
             */
            namespace?: string;
          };
        };
        /**
         * APIURL is the URL of the Pulumi API.
         */
        apiUrl?: string;
        /**
         * Environment are YAML documents composed of static key-value pairs, programmatic expressions,
         * dynamically retrieved values from supported providers including all major clouds,
         * and other Pulumi ESC environments.
         * To create a new environment, visit https://www.pulumi.com/docs/esc/environments/ for more information.
         */
        environment: string;
        /**
         * Organization are a space to collaborate on shared projects and stacks.
         * To create a new organization, visit https://app.pulumi.com/ and click "New Organization".
         */
        organization: string;
        /**
         * Project is the name of the Pulumi ESC project the environment belongs to.
         */
        project: string;
      };
      /**
       * Scaleway
       */
      scaleway?: {
        /**
         * AccessKey is the non-secret part of the api key.
         */
        accessKey: {
          /**
           * SecretRef references a key in a secret that will be used as value.
           */
          secretRef?: {
            /**
             * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
             * defaulted, in others it may be required.
             */
            key?: string;
            /**
             * The name of the Secret resource being referred to.
             */
            name?: string;
            /**
             * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
             * to the namespace of the referent.
             */
            namespace?: string;
          };
          /**
           * Value can be specified directly to set a value without using a secret.
           */
          value?: string;
        };
        /**
         * APIURL is the url of the api to use. Defaults to https://api.scaleway.com
         */
        apiUrl?: string;
        /**
         * ProjectID is the id of your project, which you can find in the console: https://console.scaleway.com/project/settings
         */
        projectId: string;
        /**
         * Region where your secrets are located: https://developers.scaleway.com/en/quickstart/#region-and-zone
         */
        region: string;
        /**
         * SecretKey is the non-secret part of the api key.
         */
        secretKey: {
          /**
           * SecretRef references a key in a secret that will be used as value.
           */
          secretRef?: {
            /**
             * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
             * defaulted, in others it may be required.
             */
            key?: string;
            /**
             * The name of the Secret resource being referred to.
             */
            name?: string;
            /**
             * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
             * to the namespace of the referent.
             */
            namespace?: string;
          };
          /**
           * Value can be specified directly to set a value without using a secret.
           */
          value?: string;
        };
      };
      /**
       * SecretServer configures this store to sync secrets using SecretServer provider
       * https://docs.delinea.com/online-help/secret-server/start.htm
       */
      secretserver?: {
        /**
         * Password is the secret server account password.
         */
        password: {
          /**
           * SecretRef references a key in a secret that will be used as value.
           */
          secretRef?: {
            /**
             * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
             * defaulted, in others it may be required.
             */
            key?: string;
            /**
             * The name of the Secret resource being referred to.
             */
            name?: string;
            /**
             * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
             * to the namespace of the referent.
             */
            namespace?: string;
          };
          /**
           * Value can be specified directly to set a value without using a secret.
           */
          value?: string;
        };
        /**
         * ServerURL
         * URL to your secret server installation
         */
        serverURL: string;
        /**
         * Username is the secret server account username.
         */
        username: {
          /**
           * SecretRef references a key in a secret that will be used as value.
           */
          secretRef?: {
            /**
             * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
             * defaulted, in others it may be required.
             */
            key?: string;
            /**
             * The name of the Secret resource being referred to.
             */
            name?: string;
            /**
             * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
             * to the namespace of the referent.
             */
            namespace?: string;
          };
          /**
           * Value can be specified directly to set a value without using a secret.
           */
          value?: string;
        };
      };
      /**
       * Senhasegura configures this store to sync secrets using senhasegura provider
       */
      senhasegura?: {
        /**
         * Auth defines parameters to authenticate in senhasegura
         */
        auth: {
          clientId: string;
          /**
           * A reference to a specific 'key' within a Secret resource,
           * In some instances, `key` is a required field.
           */
          clientSecretSecretRef: {
            /**
             * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
             * defaulted, in others it may be required.
             */
            key?: string;
            /**
             * The name of the Secret resource being referred to.
             */
            name?: string;
            /**
             * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
             * to the namespace of the referent.
             */
            namespace?: string;
          };
        };
        /**
         * IgnoreSslCertificate defines if SSL certificate must be ignored
         */
        ignoreSslCertificate?: boolean;
        /**
         * Module defines which senhasegura module should be used to get secrets
         */
        module: string;
        /**
         * URL of senhasegura
         */
        url: string;
      };
      /**
       * Vault configures this store to sync secrets using Hashi provider
       */
      vault?: {
        /**
         * Auth configures how secret-manager authenticates with the Vault server.
         */
        auth: {
          /**
           * AppRole authenticates with Vault using the App Role auth mechanism,
           * with the role and secret stored in a Kubernetes Secret resource.
           */
          appRole?: {
            /**
             * Path where the App Role authentication backend is mounted
             * in Vault, e.g: "approle"
             */
            path: string;
            /**
             * RoleID configured in the App Role authentication backend when setting
             * up the authentication backend in Vault.
             */
            roleId?: string;
            /**
             * Reference to a key in a Secret that contains the App Role ID used
             * to authenticate with Vault.
             * The `key` field must be specified and denotes which entry within the Secret
             * resource is used as the app role id.
             */
            roleRef?: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
            /**
             * Reference to a key in a Secret that contains the App Role secret used
             * to authenticate with Vault.
             * The `key` field must be specified and denotes which entry within the Secret
             * resource is used as the app role secret.
             */
            secretRef: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
          };
          /**
           * Cert authenticates with TLS Certificates by passing client certificate, private key and ca certificate
           * Cert authentication method
           */
          cert?: {
            /**
             * ClientCert is a certificate to authenticate using the Cert Vault
             * authentication method
             */
            clientCert?: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
            /**
             * SecretRef to a key in a Secret resource containing client private key to
             * authenticate with Vault using the Cert authentication method
             */
            secretRef?: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
          };
          /**
           * Iam authenticates with vault by passing a special AWS request signed with AWS IAM credentials
           * AWS IAM authentication method
           */
          iam?: {
            /**
             * AWS External ID set on assumed IAM roles
             */
            externalID?: string;
            /**
             * Specify a service account with IRSA enabled
             */
            jwt?: {
              /**
               * A reference to a ServiceAccount resource.
               */
              serviceAccountRef?: {
                /**
                 * Audience specifies the `aud` claim for the service account token
                 * If the service account uses a well-known annotation for e.g. IRSA or GCP Workload Identity
                 * then this audiences will be appended to the list
                 */
                audiences?: string[];
                /**
                 * The name of the ServiceAccount resource being referred to.
                 */
                name: string;
                /**
                 * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
                 * to the namespace of the referent.
                 */
                namespace?: string;
              };
            };
            /**
             * Path where the AWS auth method is enabled in Vault, e.g: "aws"
             */
            path?: string;
            /**
             * AWS region
             */
            region?: string;
            /**
             * This is the AWS role to be assumed before talking to vault
             */
            role?: string;
            /**
             * Specify credentials in a Secret object
             */
            secretRef?: {
              /**
               * The AccessKeyID is used for authentication
               */
              accessKeyIDSecretRef?: {
                /**
                 * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
                 * defaulted, in others it may be required.
                 */
                key?: string;
                /**
                 * The name of the Secret resource being referred to.
                 */
                name?: string;
                /**
                 * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
                 * to the namespace of the referent.
                 */
                namespace?: string;
              };
              /**
               * The SecretAccessKey is used for authentication
               */
              secretAccessKeySecretRef?: {
                /**
                 * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
                 * defaulted, in others it may be required.
                 */
                key?: string;
                /**
                 * The name of the Secret resource being referred to.
                 */
                name?: string;
                /**
                 * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
                 * to the namespace of the referent.
                 */
                namespace?: string;
              };
              /**
               * The SessionToken used for authentication
               * This must be defined if AccessKeyID and SecretAccessKey are temporary credentials
               * see: https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_temp_use-resources.html
               */
              sessionTokenSecretRef?: {
                /**
                 * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
                 * defaulted, in others it may be required.
                 */
                key?: string;
                /**
                 * The name of the Secret resource being referred to.
                 */
                name?: string;
                /**
                 * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
                 * to the namespace of the referent.
                 */
                namespace?: string;
              };
            };
            /**
             * X-Vault-AWS-IAM-Server-ID is an additional header used by Vault IAM auth method to mitigate against different types of replay attacks. More details here: https://developer.hashicorp.com/vault/docs/auth/aws
             */
            vaultAwsIamServerID?: string;
            /**
             * Vault Role. In vault, a role describes an identity with a set of permissions, groups, or policies you want to attach a user of the secrets engine
             */
            vaultRole: string;
          };
          /**
           * Jwt authenticates with Vault by passing role and JWT token using the
           * JWT/OIDC authentication method
           */
          jwt?: {
            /**
             * Optional ServiceAccountToken specifies the Kubernetes service account for which to request
             * a token for with the `TokenRequest` API.
             */
            kubernetesServiceAccountToken?: {
              /**
               * Optional audiences field that will be used to request a temporary Kubernetes service
               * account token for the service account referenced by `serviceAccountRef`.
               * Defaults to a single audience `vault` it not specified.
               * Deprecated: use serviceAccountRef.Audiences instead
               */
              audiences?: string[];
              /**
               * Optional expiration time in seconds that will be used to request a temporary
               * Kubernetes service account token for the service account referenced by
               * `serviceAccountRef`.
               * Deprecated: this will be removed in the future.
               * Defaults to 10 minutes.
               */
              expirationSeconds?: number;
              /**
               * Service account field containing the name of a kubernetes ServiceAccount.
               */
              serviceAccountRef: {
                /**
                 * Audience specifies the `aud` claim for the service account token
                 * If the service account uses a well-known annotation for e.g. IRSA or GCP Workload Identity
                 * then this audiences will be appended to the list
                 */
                audiences?: string[];
                /**
                 * The name of the ServiceAccount resource being referred to.
                 */
                name: string;
                /**
                 * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
                 * to the namespace of the referent.
                 */
                namespace?: string;
              };
            };
            /**
             * Path where the JWT authentication backend is mounted
             * in Vault, e.g: "jwt"
             */
            path: string;
            /**
             * Role is a JWT role to authenticate using the JWT/OIDC Vault
             * authentication method
             */
            role?: string;
            /**
             * Optional SecretRef that refers to a key in a Secret resource containing JWT token to
             * authenticate with Vault using the JWT/OIDC authentication method.
             */
            secretRef?: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
          };
          /**
           * Kubernetes authenticates with Vault by passing the ServiceAccount
           * token stored in the named Secret resource to the Vault server.
           */
          kubernetes?: {
            /**
             * Path where the Kubernetes authentication backend is mounted in Vault, e.g:
             * "kubernetes"
             */
            mountPath: string;
            /**
             * A required field containing the Vault Role to assume. A Role binds a
             * Kubernetes ServiceAccount with a set of Vault policies.
             */
            role: string;
            /**
             * Optional secret field containing a Kubernetes ServiceAccount JWT used
             * for authenticating with Vault. If a name is specified without a key,
             * `token` is the default. If one is not specified, the one bound to
             * the controller will be used.
             */
            secretRef?: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
            /**
             * Optional service account field containing the name of a kubernetes ServiceAccount.
             * If the service account is specified, the service account secret token JWT will be used
             * for authenticating with Vault. If the service account selector is not supplied,
             * the secretRef will be used instead.
             */
            serviceAccountRef?: {
              /**
               * Audience specifies the `aud` claim for the service account token
               * If the service account uses a well-known annotation for e.g. IRSA or GCP Workload Identity
               * then this audiences will be appended to the list
               */
              audiences?: string[];
              /**
               * The name of the ServiceAccount resource being referred to.
               */
              name: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
          };
          /**
           * Ldap authenticates with Vault by passing username/password pair using
           * the LDAP authentication method
           */
          ldap?: {
            /**
             * Path where the LDAP authentication backend is mounted
             * in Vault, e.g: "ldap"
             */
            path: string;
            /**
             * SecretRef to a key in a Secret resource containing password for the LDAP
             * user used to authenticate with Vault using the LDAP authentication
             * method
             */
            secretRef?: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
            /**
             * Username is a LDAP user name used to authenticate using the LDAP Vault
             * authentication method
             */
            username: string;
          };
          /**
           * Name of the vault namespace to authenticate to. This can be different than the namespace your secret is in.
           * Namespaces is a set of features within Vault Enterprise that allows
           * Vault environments to support Secure Multi-tenancy. e.g: "ns1".
           * More about namespaces can be found here https://www.vaultproject.io/docs/enterprise/namespaces
           * This will default to Vault.Namespace field if set, or empty otherwise
           */
          namespace?: string;
          /**
           * TokenSecretRef authenticates with Vault by presenting a token.
           */
          tokenSecretRef?: {
            /**
             * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
             * defaulted, in others it may be required.
             */
            key?: string;
            /**
             * The name of the Secret resource being referred to.
             */
            name?: string;
            /**
             * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
             * to the namespace of the referent.
             */
            namespace?: string;
          };
          /**
           * UserPass authenticates with Vault by passing username/password pair
           */
          userPass?: {
            /**
             * Path where the UserPassword authentication backend is mounted
             * in Vault, e.g: "user"
             */
            path: string;
            /**
             * SecretRef to a key in a Secret resource containing password for the
             * user used to authenticate with Vault using the UserPass authentication
             * method
             */
            secretRef?: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
            /**
             * Username is a user name used to authenticate using the UserPass Vault
             * authentication method
             */
            username: string;
          };
        };
        /**
         * PEM encoded CA bundle used to validate Vault server certificate. Only used
         * if the Server URL is using HTTPS protocol. This parameter is ignored for
         * plain HTTP protocol connection. If not set the system root certificates
         * are used to validate the TLS connection.
         */
        caBundle?: string;
        /**
         * The provider for the CA bundle to use to validate Vault server certificate.
         */
        caProvider?: {
          /**
           * The key where the CA certificate can be found in the Secret or ConfigMap.
           */
          key?: string;
          /**
           * The name of the object located at the provider type.
           */
          name: string;
          /**
           * The namespace the Provider type is in.
           * Can only be defined when used in a ClusterSecretStore.
           */
          namespace?: string;
          /**
           * The type of provider to use such as "Secret", or "ConfigMap".
           */
          type: 'Secret' | 'ConfigMap';
        };
        /**
         * ForwardInconsistent tells Vault to forward read-after-write requests to the Vault
         * leader instead of simply retrying within a loop. This can increase performance if
         * the option is enabled serverside.
         * https://www.vaultproject.io/docs/configuration/replication#allow_forwarding_via_header
         */
        forwardInconsistent?: boolean;
        /**
         * Headers to be added in Vault request
         */
        headers?: {
          [k: string]: string;
        };
        /**
         * Name of the vault namespace. Namespaces is a set of features within Vault Enterprise that allows
         * Vault environments to support Secure Multi-tenancy. e.g: "ns1".
         * More about namespaces can be found here https://www.vaultproject.io/docs/enterprise/namespaces
         */
        namespace?: string;
        /**
         * Path is the mount path of the Vault KV backend endpoint, e.g:
         * "secret". The v2 KV secret engine version specific "/data" path suffix
         * for fetching secrets from Vault is optional and will be appended
         * if not present in specified path.
         */
        path?: string;
        /**
         * ReadYourWrites ensures isolated read-after-write semantics by
         * providing discovered cluster replication states in each request.
         * More information about eventual consistency in Vault can be found here
         * https://www.vaultproject.io/docs/enterprise/consistency
         */
        readYourWrites?: boolean;
        /**
         * Server is the connection address for the Vault server, e.g: "https://vault.example.com:8200".
         */
        server: string;
        /**
         * The configuration used for client side related TLS communication, when the Vault server
         * requires mutual authentication. Only used if the Server URL is using HTTPS protocol.
         * This parameter is ignored for plain HTTP protocol connection.
         * It's worth noting this configuration is different from the "TLS certificates auth method",
         * which is available under the `auth.cert` section.
         */
        tls?: {
          /**
           * CertSecretRef is a certificate added to the transport layer
           * when communicating with the Vault server.
           * If no key for the Secret is specified, external-secret will default to 'tls.crt'.
           */
          certSecretRef?: {
            /**
             * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
             * defaulted, in others it may be required.
             */
            key?: string;
            /**
             * The name of the Secret resource being referred to.
             */
            name?: string;
            /**
             * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
             * to the namespace of the referent.
             */
            namespace?: string;
          };
          /**
           * KeySecretRef to a key in a Secret resource containing client private key
           * added to the transport layer when communicating with the Vault server.
           * If no key for the Secret is specified, external-secret will default to 'tls.key'.
           */
          keySecretRef?: {
            /**
             * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
             * defaulted, in others it may be required.
             */
            key?: string;
            /**
             * The name of the Secret resource being referred to.
             */
            name?: string;
            /**
             * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
             * to the namespace of the referent.
             */
            namespace?: string;
          };
        };
        /**
         * Version is the Vault KV secret engine version. This can be either "v1" or
         * "v2". Version defaults to "v2".
         */
        version?: 'v1' | 'v2';
      };
      /**
       * Webhook configures this store to sync secrets using a generic templated webhook
       */
      webhook?: {
        /**
         * Body
         */
        body?: string;
        /**
         * PEM encoded CA bundle used to validate webhook server certificate. Only used
         * if the Server URL is using HTTPS protocol. This parameter is ignored for
         * plain HTTP protocol connection. If not set the system root certificates
         * are used to validate the TLS connection.
         */
        caBundle?: string;
        /**
         * The provider for the CA bundle to use to validate webhook server certificate.
         */
        caProvider?: {
          /**
           * The key the value inside of the provider type to use, only used with "Secret" type
           */
          key?: string;
          /**
           * The name of the object located at the provider type.
           */
          name: string;
          /**
           * The namespace the Provider type is in.
           */
          namespace?: string;
          /**
           * The type of provider to use such as "Secret", or "ConfigMap".
           */
          type: 'Secret' | 'ConfigMap';
        };
        /**
         * Headers
         */
        headers?: {
          [k: string]: string;
        };
        /**
         * Webhook Method
         */
        method?: string;
        /**
         * Result formatting
         */
        result: {
          /**
           * Json path of return value
           */
          jsonPath?: string;
        };
        /**
         * Secrets to fill in templates
         * These secrets will be passed to the templating function as key value pairs under the given name
         */
        secrets?: {
          /**
           * Name of this secret in templates
           */
          name: string;
          /**
           * Secret ref to fill in credentials
           */
          secretRef: {
            /**
             * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
             * defaulted, in others it may be required.
             */
            key?: string;
            /**
             * The name of the Secret resource being referred to.
             */
            name?: string;
            /**
             * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
             * to the namespace of the referent.
             */
            namespace?: string;
          };
        }[];
        /**
         * Timeout
         */
        timeout?: string;
        /**
         * Webhook url to call
         */
        url: string;
      };
      /**
       * YandexCertificateManager configures this store to sync secrets using Yandex Certificate Manager provider
       */
      yandexcertificatemanager?: {
        /**
         * Yandex.Cloud API endpoint (e.g. 'api.cloud.yandex.net:443')
         */
        apiEndpoint?: string;
        /**
         * Auth defines the information necessary to authenticate against Yandex Certificate Manager
         */
        auth: {
          /**
           * The authorized key used for authentication
           */
          authorizedKeySecretRef?: {
            /**
             * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
             * defaulted, in others it may be required.
             */
            key?: string;
            /**
             * The name of the Secret resource being referred to.
             */
            name?: string;
            /**
             * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
             * to the namespace of the referent.
             */
            namespace?: string;
          };
        };
        /**
         * The provider for the CA bundle to use to validate Yandex.Cloud server certificate.
         */
        caProvider?: {
          /**
           * A reference to a specific 'key' within a Secret resource,
           * In some instances, `key` is a required field.
           */
          certSecretRef?: {
            /**
             * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
             * defaulted, in others it may be required.
             */
            key?: string;
            /**
             * The name of the Secret resource being referred to.
             */
            name?: string;
            /**
             * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
             * to the namespace of the referent.
             */
            namespace?: string;
          };
        };
      };
      /**
       * YandexLockbox configures this store to sync secrets using Yandex Lockbox provider
       */
      yandexlockbox?: {
        /**
         * Yandex.Cloud API endpoint (e.g. 'api.cloud.yandex.net:443')
         */
        apiEndpoint?: string;
        /**
         * Auth defines the information necessary to authenticate against Yandex Lockbox
         */
        auth: {
          /**
           * The authorized key used for authentication
           */
          authorizedKeySecretRef?: {
            /**
             * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
             * defaulted, in others it may be required.
             */
            key?: string;
            /**
             * The name of the Secret resource being referred to.
             */
            name?: string;
            /**
             * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
             * to the namespace of the referent.
             */
            namespace?: string;
          };
        };
        /**
         * The provider for the CA bundle to use to validate Yandex.Cloud server certificate.
         */
        caProvider?: {
          /**
           * A reference to a specific 'key' within a Secret resource,
           * In some instances, `key` is a required field.
           */
          certSecretRef?: {
            /**
             * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
             * defaulted, in others it may be required.
             */
            key?: string;
            /**
             * The name of the Secret resource being referred to.
             */
            name?: string;
            /**
             * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
             * to the namespace of the referent.
             */
            namespace?: string;
          };
        };
      };
    };
    /**
     * Used to configure store refresh interval in seconds. Empty or 0 will default to the controller config.
     */
    refreshInterval?: number;
    /**
     * Used to configure http retries if failed
     */
    retrySettings?: {
      maxRetries?: number;
      retryInterval?: string;
    };
  };
  /**
   * SecretStoreStatus defines the observed state of the SecretStore.
   */
  status?: {
    /**
     * SecretStoreCapabilities defines the possible operations a SecretStore can do.
     */
    capabilities?: string;
    conditions?: {
      lastTransitionTime?: string;
      message?: string;
      reason?: string;
      status: string;
      type: string;
    }[];
  };
}

/**
 * ClusterSecretStore represents a secure external location for storing secrets, which can be referenced as part of `storeRef` fields.
 */
export interface IClusterSecretStore {
  /**
   * APIVersion defines the versioned schema of this representation of an object.
   * Servers should convert recognized schemas to the latest internal value, and
   * may reject unrecognized values.
   * More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#resources
   */
  apiVersion: 'v1beta1';
  /**
   * Kind is a string value representing the REST resource this object represents.
   * Servers may infer this from the endpoint the client submits requests to.
   * Cannot be updated.
   * In CamelCase.
   * More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#types-kinds
   */
  kind: 'ClusterSecretStore';
  metadata: metav1.IObjectMeta;
  /**
   * SecretStoreSpec defines the desired state of SecretStore.
   */
  spec?: {
    /**
     * Used to constraint a ClusterSecretStore to specific namespaces. Relevant only to ClusterSecretStore
     */
    conditions?: {
      /**
       * Choose namespaces by using regex matching
       */
      namespaceRegexes?: string[];
      /**
       * Choose namespace using a labelSelector
       */
      namespaceSelector?: {
        /**
         * matchExpressions is a list of label selector requirements. The requirements are ANDed.
         */
        matchExpressions?: {
          /**
           * key is the label key that the selector applies to.
           */
          key: string;
          /**
           * operator represents a key's relationship to a set of values.
           * Valid operators are In, NotIn, Exists and DoesNotExist.
           */
          operator: string;
          /**
           * values is an array of string values. If the operator is In or NotIn,
           * the values array must be non-empty. If the operator is Exists or DoesNotExist,
           * the values array must be empty. This array is replaced during a strategic
           * merge patch.
           */
          values?: string[];
        }[];
        /**
         * matchLabels is a map of {key,value} pairs. A single {key,value} in the matchLabels
         * map is equivalent to an element of matchExpressions, whose key field is "key", the
         * operator is "In", and the values array contains only "value". The requirements are ANDed.
         */
        matchLabels?: {
          [k: string]: string;
        };
      };
      /**
       * Choose namespaces by name
       */
      namespaces?: string[];
    }[];
    /**
     * Used to select the correct ESO controller (think: ingress.ingressClassName)
     * The ESO controller is instantiated with a specific controller name and filters ES based on this property
     */
    controller?: string;
    /**
     * Used to configure the provider. Only one provider may be set
     */
    provider: {
      /**
       * Akeyless configures this store to sync secrets using Akeyless Vault provider
       */
      akeyless?: {
        /**
         * Akeyless GW API Url from which the secrets to be fetched from.
         */
        akeylessGWApiURL: string;
        /**
         * Auth configures how the operator authenticates with Akeyless.
         */
        authSecretRef: {
          /**
           * Kubernetes authenticates with Akeyless by passing the ServiceAccount
           * token stored in the named Secret resource.
           */
          kubernetesAuth?: {
            /**
             * the Akeyless Kubernetes auth-method access-id
             */
            accessID: string;
            /**
             * Kubernetes-auth configuration name in Akeyless-Gateway
             */
            k8sConfName: string;
            /**
             * Optional secret field containing a Kubernetes ServiceAccount JWT used
             * for authenticating with Akeyless. If a name is specified without a key,
             * `token` is the default. If one is not specified, the one bound to
             * the controller will be used.
             */
            secretRef?: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
            /**
             * Optional service account field containing the name of a kubernetes ServiceAccount.
             * If the service account is specified, the service account secret token JWT will be used
             * for authenticating with Akeyless. If the service account selector is not supplied,
             * the secretRef will be used instead.
             */
            serviceAccountRef?: {
              /**
               * Audience specifies the `aud` claim for the service account token
               * If the service account uses a well-known annotation for e.g. IRSA or GCP Workload Identity
               * then this audiences will be appended to the list
               */
              audiences?: string[];
              /**
               * The name of the ServiceAccount resource being referred to.
               */
              name: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
          };
          /**
           * Reference to a Secret that contains the details
           * to authenticate with Akeyless.
           */
          secretRef?: {
            /**
             * The SecretAccessID is used for authentication
             */
            accessID?: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
            /**
             * A reference to a specific 'key' within a Secret resource,
             * In some instances, `key` is a required field.
             */
            accessType?: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
            /**
             * A reference to a specific 'key' within a Secret resource,
             * In some instances, `key` is a required field.
             */
            accessTypeParam?: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
          };
        };
        /**
         * PEM/base64 encoded CA bundle used to validate Akeyless Gateway certificate. Only used
         * if the AkeylessGWApiURL URL is using HTTPS protocol. If not set the system root certificates
         * are used to validate the TLS connection.
         */
        caBundle?: string;
        /**
         * The provider for the CA bundle to use to validate Akeyless Gateway certificate.
         */
        caProvider?: {
          /**
           * The key where the CA certificate can be found in the Secret or ConfigMap.
           */
          key?: string;
          /**
           * The name of the object located at the provider type.
           */
          name: string;
          /**
           * The namespace the Provider type is in.
           * Can only be defined when used in a ClusterSecretStore.
           */
          namespace?: string;
          /**
           * The type of provider to use such as "Secret", or "ConfigMap".
           */
          type: 'Secret' | 'ConfigMap';
        };
      };
      /**
       * Alibaba configures this store to sync secrets using Alibaba Cloud provider
       */
      alibaba?: {
        /**
         * AlibabaAuth contains a secretRef for credentials.
         */
        auth: {
          /**
           * Authenticate against Alibaba using RRSA.
           */
          rrsa?: {
            oidcProviderArn: string;
            oidcTokenFilePath: string;
            roleArn: string;
            sessionName: string;
          };
          /**
           * AlibabaAuthSecretRef holds secret references for Alibaba credentials.
           */
          secretRef?: {
            /**
             * The AccessKeyID is used for authentication
             */
            accessKeyIDSecretRef: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
            /**
             * The AccessKeySecret is used for authentication
             */
            accessKeySecretSecretRef: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
          };
        };
        /**
         * Alibaba Region to be used for the provider
         */
        regionID: string;
      };
      /**
       * AWS configures this store to sync secrets using AWS Secret Manager provider
       */
      aws?: {
        /**
         * AdditionalRoles is a chained list of Role ARNs which the provider will sequentially assume before assuming the Role
         */
        additionalRoles?: string[];
        /**
         * Auth defines the information necessary to authenticate against AWS
         * if not set aws sdk will infer credentials from your environment
         * see: https://docs.aws.amazon.com/sdk-for-go/v1/developer-guide/configuring-sdk.html#specifying-credentials
         */
        auth?: {
          /**
           * Authenticate against AWS using service account tokens.
           */
          jwt?: {
            /**
             * A reference to a ServiceAccount resource.
             */
            serviceAccountRef?: {
              /**
               * Audience specifies the `aud` claim for the service account token
               * If the service account uses a well-known annotation for e.g. IRSA or GCP Workload Identity
               * then this audiences will be appended to the list
               */
              audiences?: string[];
              /**
               * The name of the ServiceAccount resource being referred to.
               */
              name: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
          };
          /**
           * AWSAuthSecretRef holds secret references for AWS credentials
           * both AccessKeyID and SecretAccessKey must be defined in order to properly authenticate.
           */
          secretRef?: {
            /**
             * The AccessKeyID is used for authentication
             */
            accessKeyIDSecretRef?: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
            /**
             * The SecretAccessKey is used for authentication
             */
            secretAccessKeySecretRef?: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
            /**
             * The SessionToken used for authentication
             * This must be defined if AccessKeyID and SecretAccessKey are temporary credentials
             * see: https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_temp_use-resources.html
             */
            sessionTokenSecretRef?: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
          };
        };
        /**
         * AWS External ID set on assumed IAM roles
         */
        externalID?: string;
        /**
         * Prefix adds a prefix to all retrieved values.
         */
        prefix?: string;
        /**
         * AWS Region to be used for the provider
         */
        region: string;
        /**
         * Role is a Role ARN which the provider will assume
         */
        role?: string;
        /**
         * SecretsManager defines how the provider behaves when interacting with AWS SecretsManager
         */
        secretsManager?: {
          /**
           * Specifies whether to delete the secret without any recovery window. You
           * can't use both this parameter and RecoveryWindowInDays in the same call.
           * If you don't use either, then by default Secrets Manager uses a 30 day
           * recovery window.
           * see: https://docs.aws.amazon.com/secretsmanager/latest/apireference/API_DeleteSecret.html#SecretsManager-DeleteSecret-request-ForceDeleteWithoutRecovery
           */
          forceDeleteWithoutRecovery?: boolean;
          /**
           * The number of days from 7 to 30 that Secrets Manager waits before
           * permanently deleting the secret. You can't use both this parameter and
           * ForceDeleteWithoutRecovery in the same call. If you don't use either,
           * then by default Secrets Manager uses a 30 day recovery window.
           * see: https://docs.aws.amazon.com/secretsmanager/latest/apireference/API_DeleteSecret.html#SecretsManager-DeleteSecret-request-RecoveryWindowInDays
           */
          recoveryWindowInDays?: number;
        };
        /**
         * Service defines which service should be used to fetch the secrets
         */
        service: 'SecretsManager' | 'ParameterStore';
        /**
         * AWS STS assume role session tags
         */
        sessionTags?: {
          key: string;
          value: string;
        }[];
        /**
         * AWS STS assume role transitive session tags. Required when multiple rules are used with the provider
         */
        transitiveTagKeys?: string[];
      };
      /**
       * AzureKV configures this store to sync secrets using Azure Key Vault provider
       */
      azurekv?: {
        /**
         * Auth configures how the operator authenticates with Azure. Required for ServicePrincipal auth type. Optional for WorkloadIdentity.
         */
        authSecretRef?: {
          /**
           * The Azure ClientCertificate of the service principle used for authentication.
           */
          clientCertificate?: {
            /**
             * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
             * defaulted, in others it may be required.
             */
            key?: string;
            /**
             * The name of the Secret resource being referred to.
             */
            name?: string;
            /**
             * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
             * to the namespace of the referent.
             */
            namespace?: string;
          };
          /**
           * The Azure clientId of the service principle or managed identity used for authentication.
           */
          clientId?: {
            /**
             * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
             * defaulted, in others it may be required.
             */
            key?: string;
            /**
             * The name of the Secret resource being referred to.
             */
            name?: string;
            /**
             * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
             * to the namespace of the referent.
             */
            namespace?: string;
          };
          /**
           * The Azure ClientSecret of the service principle used for authentication.
           */
          clientSecret?: {
            /**
             * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
             * defaulted, in others it may be required.
             */
            key?: string;
            /**
             * The name of the Secret resource being referred to.
             */
            name?: string;
            /**
             * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
             * to the namespace of the referent.
             */
            namespace?: string;
          };
          /**
           * The Azure tenantId of the managed identity used for authentication.
           */
          tenantId?: {
            /**
             * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
             * defaulted, in others it may be required.
             */
            key?: string;
            /**
             * The name of the Secret resource being referred to.
             */
            name?: string;
            /**
             * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
             * to the namespace of the referent.
             */
            namespace?: string;
          };
        };
        /**
         * Auth type defines how to authenticate to the keyvault service.
         * Valid values are:
         * - "ServicePrincipal" (default): Using a service principal (tenantId, clientId, clientSecret)
         * - "ManagedIdentity": Using Managed Identity assigned to the pod (see aad-pod-identity)
         */
        authType?: 'ServicePrincipal' | 'ManagedIdentity' | 'WorkloadIdentity';
        /**
         * EnvironmentType specifies the Azure cloud environment endpoints to use for
         * connecting and authenticating with Azure. By default it points to the public cloud AAD endpoint.
         * The following endpoints are available, also see here: https://github.com/Azure/go-autorest/blob/main/autorest/azure/environments.go#L152
         * PublicCloud, USGovernmentCloud, ChinaCloud, GermanCloud
         */
        environmentType?:
          | 'PublicCloud'
          | 'USGovernmentCloud'
          | 'ChinaCloud'
          | 'GermanCloud';
        /**
         * If multiple Managed Identity is assigned to the pod, you can select the one to be used
         */
        identityId?: string;
        /**
         * ServiceAccountRef specified the service account
         * that should be used when authenticating with WorkloadIdentity.
         */
        serviceAccountRef?: {
          /**
           * Audience specifies the `aud` claim for the service account token
           * If the service account uses a well-known annotation for e.g. IRSA or GCP Workload Identity
           * then this audiences will be appended to the list
           */
          audiences?: string[];
          /**
           * The name of the ServiceAccount resource being referred to.
           */
          name: string;
          /**
           * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
           * to the namespace of the referent.
           */
          namespace?: string;
        };
        /**
         * TenantID configures the Azure Tenant to send requests to. Required for ServicePrincipal auth type. Optional for WorkloadIdentity.
         */
        tenantId?: string;
        /**
         * Vault Url from which the secrets to be fetched from.
         */
        vaultUrl: string;
      };
      /**
       * Beyondtrust configures this store to sync secrets using Password Safe provider.
       */
      beyondtrust?: {
        /**
         * Auth configures how the operator authenticates with Beyondtrust.
         */
        auth: {
          /**
           * Content of the certificate (cert.pem) for use when authenticating with an OAuth client Id using a Client Certificate.
           */
          certificate?: {
            /**
             * SecretRef references a key in a secret that will be used as value.
             */
            secretRef?: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
            /**
             * Value can be specified directly to set a value without using a secret.
             */
            value?: string;
          };
          /**
           * Certificate private key (key.pem). For use when authenticating with an OAuth client Id
           */
          certificateKey?: {
            /**
             * SecretRef references a key in a secret that will be used as value.
             */
            secretRef?: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
            /**
             * Value can be specified directly to set a value without using a secret.
             */
            value?: string;
          };
          clientId: {
            /**
             * SecretRef references a key in a secret that will be used as value.
             */
            secretRef?: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
            /**
             * Value can be specified directly to set a value without using a secret.
             */
            value?: string;
          };
          clientSecret: {
            /**
             * SecretRef references a key in a secret that will be used as value.
             */
            secretRef?: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
            /**
             * Value can be specified directly to set a value without using a secret.
             */
            value?: string;
          };
        };
        /**
         * Auth configures how API server works.
         */
        server: {
          apiUrl: string;
          /**
           * Timeout specifies a time limit for requests made by this Client. The timeout includes connection time, any redirects, and reading the response body. Defaults to 45 seconds.
           */
          clientTimeOutSeconds?: number;
          /**
           * The secret retrieval type. SECRET = Secrets Safe (credential, text, file). MANAGED_ACCOUNT = Password Safe account associated with a system.
           */
          retrievalType?: string;
          /**
           * A character that separates the folder names.
           */
          separator?: string;
          verifyCA: boolean;
        };
      };
      /**
       * BitwardenSecretsManager configures this store to sync secrets using BitwardenSecretsManager provider
       */
      bitwardensecretsmanager?: {
        apiURL?: string;
        /**
         * Auth configures how secret-manager authenticates with a bitwarden machine account instance.
         * Make sure that the token being used has permissions on the given secret.
         */
        auth: {
          /**
           * BitwardenSecretsManagerSecretRef contains the credential ref to the bitwarden instance.
           */
          secretRef: {
            /**
             * AccessToken used for the bitwarden instance.
             */
            credentials: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
          };
        };
        bitwardenServerSDKURL?: string;
        /**
         * Base64 encoded certificate for the bitwarden server sdk. The sdk MUST run with HTTPS to make sure no MITM attack
         * can be performed.
         */
        caBundle?: string;
        /**
         * see: https://external-secrets.io/latest/spec/#external-secrets.io/v1alpha1.CAProvider
         */
        caProvider?: {
          /**
           * The key where the CA certificate can be found in the Secret or ConfigMap.
           */
          key?: string;
          /**
           * The name of the object located at the provider type.
           */
          name: string;
          /**
           * The namespace the Provider type is in.
           * Can only be defined when used in a ClusterSecretStore.
           */
          namespace?: string;
          /**
           * The type of provider to use such as "Secret", or "ConfigMap".
           */
          type: 'Secret' | 'ConfigMap';
        };
        identityURL?: string;
        /**
         * OrganizationID determines which organization this secret store manages.
         */
        organizationID: string;
        /**
         * ProjectID determines which project this secret store manages.
         */
        projectID: string;
      };
      /**
       * Chef configures this store to sync secrets with chef server
       */
      chef?: {
        /**
         * Auth defines the information necessary to authenticate against chef Server
         */
        auth: {
          /**
           * ChefAuthSecretRef holds secret references for chef server login credentials.
           */
          secretRef: {
            /**
             * SecretKey is the Signing Key in PEM format, used for authentication.
             */
            privateKeySecretRef: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
          };
        };
        /**
         * ServerURL is the chef server URL used to connect to. If using orgs you should include your org in the url and terminate the url with a "/"
         */
        serverUrl: string;
        /**
         * UserName should be the user ID on the chef server
         */
        username: string;
      };
      /**
       * Conjur configures this store to sync secrets using conjur provider
       */
      conjur?: {
        auth: {
          apikey?: {
            account: string;
            /**
             * A reference to a specific 'key' within a Secret resource,
             * In some instances, `key` is a required field.
             */
            apiKeyRef: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
            /**
             * A reference to a specific 'key' within a Secret resource,
             * In some instances, `key` is a required field.
             */
            userRef: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
          };
          jwt?: {
            account: string;
            /**
             * Optional HostID for JWT authentication. This may be used depending
             * on how the Conjur JWT authenticator policy is configured.
             */
            hostId?: string;
            /**
             * Optional SecretRef that refers to a key in a Secret resource containing JWT token to
             * authenticate with Conjur using the JWT authentication method.
             */
            secretRef?: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
            /**
             * Optional ServiceAccountRef specifies the Kubernetes service account for which to request
             * a token for with the `TokenRequest` API.
             */
            serviceAccountRef?: {
              /**
               * Audience specifies the `aud` claim for the service account token
               * If the service account uses a well-known annotation for e.g. IRSA or GCP Workload Identity
               * then this audiences will be appended to the list
               */
              audiences?: string[];
              /**
               * The name of the ServiceAccount resource being referred to.
               */
              name: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
            /**
             * The conjur authn jwt webservice id
             */
            serviceID: string;
          };
        };
        caBundle?: string;
        /**
         * Used to provide custom certificate authority (CA) certificates
         * for a secret store. The CAProvider points to a Secret or ConfigMap resource
         * that contains a PEM-encoded certificate.
         */
        caProvider?: {
          /**
           * The key where the CA certificate can be found in the Secret or ConfigMap.
           */
          key?: string;
          /**
           * The name of the object located at the provider type.
           */
          name: string;
          /**
           * The namespace the Provider type is in.
           * Can only be defined when used in a ClusterSecretStore.
           */
          namespace?: string;
          /**
           * The type of provider to use such as "Secret", or "ConfigMap".
           */
          type: 'Secret' | 'ConfigMap';
        };
        url: string;
      };
      /**
       * Delinea DevOps Secrets Vault
       * https://docs.delinea.com/online-help/products/devops-secrets-vault/current
       */
      delinea?: {
        /**
         * ClientID is the non-secret part of the credential.
         */
        clientId: {
          /**
           * SecretRef references a key in a secret that will be used as value.
           */
          secretRef?: {
            /**
             * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
             * defaulted, in others it may be required.
             */
            key?: string;
            /**
             * The name of the Secret resource being referred to.
             */
            name?: string;
            /**
             * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
             * to the namespace of the referent.
             */
            namespace?: string;
          };
          /**
           * Value can be specified directly to set a value without using a secret.
           */
          value?: string;
        };
        /**
         * ClientSecret is the secret part of the credential.
         */
        clientSecret: {
          /**
           * SecretRef references a key in a secret that will be used as value.
           */
          secretRef?: {
            /**
             * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
             * defaulted, in others it may be required.
             */
            key?: string;
            /**
             * The name of the Secret resource being referred to.
             */
            name?: string;
            /**
             * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
             * to the namespace of the referent.
             */
            namespace?: string;
          };
          /**
           * Value can be specified directly to set a value without using a secret.
           */
          value?: string;
        };
        /**
         * Tenant is the chosen hostname / site name.
         */
        tenant: string;
        /**
         * TLD is based on the server location that was chosen during provisioning.
         * If unset, defaults to "com".
         */
        tld?: string;
        /**
         * URLTemplate
         * If unset, defaults to "https://%s.secretsvaultcloud.%s/v1/%s%s".
         */
        urlTemplate?: string;
      };
      /**
       * Device42 configures this store to sync secrets using the Device42 provider
       */
      device42?: {
        /**
         * Auth configures how secret-manager authenticates with a Device42 instance.
         */
        auth: {
          secretRef: {
            /**
             * Username / Password is used for authentication.
             */
            credentials?: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
          };
        };
        /**
         * URL configures the Device42 instance URL.
         */
        host: string;
      };
      /**
       * Doppler configures this store to sync secrets using the Doppler provider
       */
      doppler?: {
        /**
         * Auth configures how the Operator authenticates with the Doppler API
         */
        auth: {
          secretRef: {
            /**
             * The DopplerToken is used for authentication.
             * See https://docs.doppler.com/reference/api#authentication for auth token types.
             * The Key attribute defaults to dopplerToken if not specified.
             */
            dopplerToken: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
          };
        };
        /**
         * Doppler config (required if not using a Service Token)
         */
        config?: string;
        /**
         * Format enables the downloading of secrets as a file (string)
         */
        format?: 'json' | 'dotnet-json' | 'env' | 'yaml' | 'docker';
        /**
         * Environment variable compatible name transforms that change secret names to a different format
         */
        nameTransformer?:
          | 'upper-camel'
          | 'camel'
          | 'lower-snake'
          | 'tf-var'
          | 'dotnet-env'
          | 'lower-kebab';
        /**
         * Doppler project (required if not using a Service Token)
         */
        project?: string;
      };
      /**
       * Fake configures a store with static key/value pairs
       */
      fake?: {
        data: {
          key: string;
          value?: string;
          /**
           * Deprecated: ValueMap is deprecated and is intended to be removed in the future, use the `value` field instead.
           */
          valueMap?: {
            [k: string]: string;
          };
          version?: string;
        }[];
      };
      /**
       * Fortanix configures this store to sync secrets using the Fortanix provider
       */
      fortanix?: {
        /**
         * APIKey is the API token to access SDKMS Applications.
         */
        apiKey?: {
          /**
           * SecretRef is a reference to a secret containing the SDKMS API Key.
           */
          secretRef?: {
            /**
             * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
             * defaulted, in others it may be required.
             */
            key?: string;
            /**
             * The name of the Secret resource being referred to.
             */
            name?: string;
            /**
             * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
             * to the namespace of the referent.
             */
            namespace?: string;
          };
        };
        /**
         * APIURL is the URL of SDKMS API. Defaults to `sdkms.fortanix.com`.
         */
        apiUrl?: string;
      };
      /**
       * GCPSM configures this store to sync secrets using Google Cloud Platform Secret Manager provider
       */
      gcpsm?: {
        /**
         * Auth defines the information necessary to authenticate against GCP
         */
        auth?: {
          secretRef?: {
            /**
             * The SecretAccessKey is used for authentication
             */
            secretAccessKeySecretRef?: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
          };
          workloadIdentity?: {
            clusterLocation: string;
            clusterName: string;
            clusterProjectID?: string;
            /**
             * A reference to a ServiceAccount resource.
             */
            serviceAccountRef: {
              /**
               * Audience specifies the `aud` claim for the service account token
               * If the service account uses a well-known annotation for e.g. IRSA or GCP Workload Identity
               * then this audiences will be appended to the list
               */
              audiences?: string[];
              /**
               * The name of the ServiceAccount resource being referred to.
               */
              name: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
          };
        };
        /**
         * Location optionally defines a location for a secret
         */
        location?: string;
        /**
         * ProjectID project where secret is located
         */
        projectID?: string;
      };
      /**
       * GitLab configures this store to sync secrets using GitLab Variables provider
       */
      gitlab?: {
        /**
         * Auth configures how secret-manager authenticates with a GitLab instance.
         */
        auth: {
          SecretRef: {
            /**
             * AccessToken is used for authentication.
             */
            accessToken?: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
          };
        };
        /**
         * Environment environment_scope of gitlab CI/CD variables (Please see https://docs.gitlab.com/ee/ci/environments/#create-a-static-environment on how to create environments)
         */
        environment?: string;
        /**
         * GroupIDs specify, which gitlab groups to pull secrets from. Group secrets are read from left to right followed by the project variables.
         */
        groupIDs?: string[];
        /**
         * InheritFromGroups specifies whether parent groups should be discovered and checked for secrets.
         */
        inheritFromGroups?: boolean;
        /**
         * ProjectID specifies a project where secrets are located.
         */
        projectID?: string;
        /**
         * URL configures the GitLab instance URL. Defaults to https://gitlab.com/.
         */
        url?: string;
      };
      /**
       * IBM configures this store to sync secrets using IBM Cloud provider
       */
      ibm?: {
        /**
         * Auth configures how secret-manager authenticates with the IBM secrets manager.
         */
        auth: {
          /**
           * IBM Container-based auth with IAM Trusted Profile.
           */
          containerAuth?: {
            iamEndpoint?: string;
            /**
             * the IBM Trusted Profile
             */
            profile: string;
            /**
             * Location the token is mounted on the pod
             */
            tokenLocation?: string;
          };
          secretRef?: {
            /**
             * The SecretAccessKey is used for authentication
             */
            secretApiKeySecretRef?: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
          };
        };
        /**
         * ServiceURL is the Endpoint URL that is specific to the Secrets Manager service instance
         */
        serviceUrl?: string;
      };
      /**
       * Infisical configures this store to sync secrets using the Infisical provider
       */
      infisical?: {
        /**
         * Auth configures how the Operator authenticates with the Infisical API
         */
        auth: {
          universalAuthCredentials?: {
            /**
             * A reference to a specific 'key' within a Secret resource,
             * In some instances, `key` is a required field.
             */
            clientId: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
            /**
             * A reference to a specific 'key' within a Secret resource,
             * In some instances, `key` is a required field.
             */
            clientSecret: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
          };
        };
        hostAPI?: string;
        secretsScope: {
          environmentSlug: string;
          projectSlug: string;
          recursive?: boolean;
          secretsPath?: string;
        };
      };
      /**
       * KeeperSecurity configures this store to sync secrets using the KeeperSecurity provider
       */
      keepersecurity?: {
        /**
         * A reference to a specific 'key' within a Secret resource,
         * In some instances, `key` is a required field.
         */
        authRef: {
          /**
           * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
           * defaulted, in others it may be required.
           */
          key?: string;
          /**
           * The name of the Secret resource being referred to.
           */
          name?: string;
          /**
           * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
           * to the namespace of the referent.
           */
          namespace?: string;
        };
        folderID: string;
      };
      /**
       * Kubernetes configures this store to sync secrets using a Kubernetes cluster provider
       */
      kubernetes?: {
        /**
         * Auth configures how secret-manager authenticates with a Kubernetes instance.
         */
        auth?: {
          /**
           * has both clientCert and clientKey as secretKeySelector
           */
          cert?: {
            /**
             * A reference to a specific 'key' within a Secret resource,
             * In some instances, `key` is a required field.
             */
            clientCert?: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
            /**
             * A reference to a specific 'key' within a Secret resource,
             * In some instances, `key` is a required field.
             */
            clientKey?: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
          };
          /**
           * points to a service account that should be used for authentication
           */
          serviceAccount?: {
            /**
             * Audience specifies the `aud` claim for the service account token
             * If the service account uses a well-known annotation for e.g. IRSA or GCP Workload Identity
             * then this audiences will be appended to the list
             */
            audiences?: string[];
            /**
             * The name of the ServiceAccount resource being referred to.
             */
            name: string;
            /**
             * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
             * to the namespace of the referent.
             */
            namespace?: string;
          };
          /**
           * use static token to authenticate with
           */
          token?: {
            /**
             * A reference to a specific 'key' within a Secret resource,
             * In some instances, `key` is a required field.
             */
            bearerToken?: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
          };
        };
        /**
         * A reference to a secret that contains the auth information.
         */
        authRef?: {
          /**
           * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
           * defaulted, in others it may be required.
           */
          key?: string;
          /**
           * The name of the Secret resource being referred to.
           */
          name?: string;
          /**
           * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
           * to the namespace of the referent.
           */
          namespace?: string;
        };
        /**
         * Remote namespace to fetch the secrets from
         */
        remoteNamespace?: string;
        /**
         * configures the Kubernetes server Address.
         */
        server?: {
          /**
           * CABundle is a base64-encoded CA certificate
           */
          caBundle?: string;
          /**
           * see: https://external-secrets.io/v0.4.1/spec/#external-secrets.io/v1alpha1.CAProvider
           */
          caProvider?: {
            /**
             * The key where the CA certificate can be found in the Secret or ConfigMap.
             */
            key?: string;
            /**
             * The name of the object located at the provider type.
             */
            name: string;
            /**
             * The namespace the Provider type is in.
             * Can only be defined when used in a ClusterSecretStore.
             */
            namespace?: string;
            /**
             * The type of provider to use such as "Secret", or "ConfigMap".
             */
            type: 'Secret' | 'ConfigMap';
          };
          /**
           * configures the Kubernetes server Address.
           */
          url?: string;
        };
      };
      /**
       * Onboardbase configures this store to sync secrets using the Onboardbase provider
       */
      onboardbase?: {
        /**
         * APIHost use this to configure the host url for the API for selfhosted installation, default is https://public.onboardbase.com/api/v1/
         */
        apiHost: string;
        /**
         * Auth configures how the Operator authenticates with the Onboardbase API
         */
        auth: {
          /**
           * OnboardbaseAPIKey is the APIKey generated by an admin account.
           * It is used to recognize and authorize access to a project and environment within onboardbase
           */
          apiKeyRef: {
            /**
             * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
             * defaulted, in others it may be required.
             */
            key?: string;
            /**
             * The name of the Secret resource being referred to.
             */
            name?: string;
            /**
             * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
             * to the namespace of the referent.
             */
            namespace?: string;
          };
          /**
           * OnboardbasePasscode is the passcode attached to the API Key
           */
          passcodeRef: {
            /**
             * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
             * defaulted, in others it may be required.
             */
            key?: string;
            /**
             * The name of the Secret resource being referred to.
             */
            name?: string;
            /**
             * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
             * to the namespace of the referent.
             */
            namespace?: string;
          };
        };
        /**
         * Environment is the name of an environmnent within a project to pull the secrets from
         */
        environment: string;
        /**
         * Project is an onboardbase project that the secrets should be pulled from
         */
        project: string;
      };
      /**
       * OnePassword configures this store to sync secrets using the 1Password Cloud provider
       */
      onepassword?: {
        /**
         * Auth defines the information necessary to authenticate against OnePassword Connect Server
         */
        auth: {
          /**
           * OnePasswordAuthSecretRef holds secret references for 1Password credentials.
           */
          secretRef: {
            /**
             * The ConnectToken is used for authentication to a 1Password Connect Server.
             */
            connectTokenSecretRef: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
          };
        };
        /**
         * ConnectHost defines the OnePassword Connect Server to connect to
         */
        connectHost: string;
        /**
         * Vaults defines which OnePassword vaults to search in which order
         */
        vaults: {
          [k: string]: number;
        };
      };
      /**
       * Oracle configures this store to sync secrets using Oracle Vault provider
       */
      oracle?: {
        /**
         * Auth configures how secret-manager authenticates with the Oracle Vault.
         * If empty, use the instance principal, otherwise the user credentials specified in Auth.
         */
        auth?: {
          /**
           * SecretRef to pass through sensitive information.
           */
          secretRef: {
            /**
             * Fingerprint is the fingerprint of the API private key.
             */
            fingerprint: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
            /**
             * PrivateKey is the user's API Signing Key in PEM format, used for authentication.
             */
            privatekey: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
          };
          /**
           * Tenancy is the tenancy OCID where user is located.
           */
          tenancy: string;
          /**
           * User is an access OCID specific to the account.
           */
          user: string;
        };
        /**
         * Compartment is the vault compartment OCID.
         * Required for PushSecret
         */
        compartment?: string;
        /**
         * EncryptionKey is the OCID of the encryption key within the vault.
         * Required for PushSecret
         */
        encryptionKey?: string;
        /**
         * The type of principal to use for authentication. If left blank, the Auth struct will
         * determine the principal type. This optional field must be specified if using
         * workload identity.
         */
        principalType?: '' | 'UserPrincipal' | 'InstancePrincipal' | 'Workload';
        /**
         * Region is the region where vault is located.
         */
        region: string;
        /**
         * ServiceAccountRef specified the service account
         * that should be used when authenticating with WorkloadIdentity.
         */
        serviceAccountRef?: {
          /**
           * Audience specifies the `aud` claim for the service account token
           * If the service account uses a well-known annotation for e.g. IRSA or GCP Workload Identity
           * then this audiences will be appended to the list
           */
          audiences?: string[];
          /**
           * The name of the ServiceAccount resource being referred to.
           */
          name: string;
          /**
           * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
           * to the namespace of the referent.
           */
          namespace?: string;
        };
        /**
         * Vault is the vault's OCID of the specific vault where secret is located.
         */
        vault: string;
      };
      passbolt?: {
        /**
         * Auth defines the information necessary to authenticate against Passbolt Server
         */
        auth: {
          /**
           * A reference to a specific 'key' within a Secret resource,
           * In some instances, `key` is a required field.
           */
          passwordSecretRef: {
            /**
             * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
             * defaulted, in others it may be required.
             */
            key?: string;
            /**
             * The name of the Secret resource being referred to.
             */
            name?: string;
            /**
             * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
             * to the namespace of the referent.
             */
            namespace?: string;
          };
          /**
           * A reference to a specific 'key' within a Secret resource,
           * In some instances, `key` is a required field.
           */
          privateKeySecretRef: {
            /**
             * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
             * defaulted, in others it may be required.
             */
            key?: string;
            /**
             * The name of the Secret resource being referred to.
             */
            name?: string;
            /**
             * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
             * to the namespace of the referent.
             */
            namespace?: string;
          };
        };
        /**
         * Host defines the Passbolt Server to connect to
         */
        host: string;
      };
      /**
       * Configures a store to sync secrets with a Password Depot instance.
       */
      passworddepot?: {
        /**
         * Auth configures how secret-manager authenticates with a Password Depot instance.
         */
        auth: {
          secretRef: {
            /**
             * Username / Password is used for authentication.
             */
            credentials?: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
          };
        };
        /**
         * Database to use as source
         */
        database: string;
        /**
         * URL configures the Password Depot instance URL.
         */
        host: string;
      };
      /**
       * Previder configures this store to sync secrets using the Previder provider
       */
      previder?: {
        /**
         * PreviderAuth contains a secretRef for credentials.
         */
        auth: {
          /**
           * PreviderAuthSecretRef holds secret references for Previder Vault credentials.
           */
          secretRef?: {
            /**
             * The AccessToken is used for authentication
             */
            accessToken: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
          };
        };
        baseUri?: string;
      };
      /**
       * Pulumi configures this store to sync secrets using the Pulumi provider
       */
      pulumi?: {
        /**
         * AccessToken is the access tokens to sign in to the Pulumi Cloud Console.
         */
        accessToken: {
          /**
           * SecretRef is a reference to a secret containing the Pulumi API token.
           */
          secretRef?: {
            /**
             * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
             * defaulted, in others it may be required.
             */
            key?: string;
            /**
             * The name of the Secret resource being referred to.
             */
            name?: string;
            /**
             * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
             * to the namespace of the referent.
             */
            namespace?: string;
          };
        };
        /**
         * APIURL is the URL of the Pulumi API.
         */
        apiUrl?: string;
        /**
         * Environment are YAML documents composed of static key-value pairs, programmatic expressions,
         * dynamically retrieved values from supported providers including all major clouds,
         * and other Pulumi ESC environments.
         * To create a new environment, visit https://www.pulumi.com/docs/esc/environments/ for more information.
         */
        environment: string;
        /**
         * Organization are a space to collaborate on shared projects and stacks.
         * To create a new organization, visit https://app.pulumi.com/ and click "New Organization".
         */
        organization: string;
        /**
         * Project is the name of the Pulumi ESC project the environment belongs to.
         */
        project: string;
      };
      /**
       * Scaleway
       */
      scaleway?: {
        /**
         * AccessKey is the non-secret part of the api key.
         */
        accessKey: {
          /**
           * SecretRef references a key in a secret that will be used as value.
           */
          secretRef?: {
            /**
             * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
             * defaulted, in others it may be required.
             */
            key?: string;
            /**
             * The name of the Secret resource being referred to.
             */
            name?: string;
            /**
             * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
             * to the namespace of the referent.
             */
            namespace?: string;
          };
          /**
           * Value can be specified directly to set a value without using a secret.
           */
          value?: string;
        };
        /**
         * APIURL is the url of the api to use. Defaults to https://api.scaleway.com
         */
        apiUrl?: string;
        /**
         * ProjectID is the id of your project, which you can find in the console: https://console.scaleway.com/project/settings
         */
        projectId: string;
        /**
         * Region where your secrets are located: https://developers.scaleway.com/en/quickstart/#region-and-zone
         */
        region: string;
        /**
         * SecretKey is the non-secret part of the api key.
         */
        secretKey: {
          /**
           * SecretRef references a key in a secret that will be used as value.
           */
          secretRef?: {
            /**
             * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
             * defaulted, in others it may be required.
             */
            key?: string;
            /**
             * The name of the Secret resource being referred to.
             */
            name?: string;
            /**
             * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
             * to the namespace of the referent.
             */
            namespace?: string;
          };
          /**
           * Value can be specified directly to set a value without using a secret.
           */
          value?: string;
        };
      };
      /**
       * SecretServer configures this store to sync secrets using SecretServer provider
       * https://docs.delinea.com/online-help/secret-server/start.htm
       */
      secretserver?: {
        /**
         * Password is the secret server account password.
         */
        password: {
          /**
           * SecretRef references a key in a secret that will be used as value.
           */
          secretRef?: {
            /**
             * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
             * defaulted, in others it may be required.
             */
            key?: string;
            /**
             * The name of the Secret resource being referred to.
             */
            name?: string;
            /**
             * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
             * to the namespace of the referent.
             */
            namespace?: string;
          };
          /**
           * Value can be specified directly to set a value without using a secret.
           */
          value?: string;
        };
        /**
         * ServerURL
         * URL to your secret server installation
         */
        serverURL: string;
        /**
         * Username is the secret server account username.
         */
        username: {
          /**
           * SecretRef references a key in a secret that will be used as value.
           */
          secretRef?: {
            /**
             * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
             * defaulted, in others it may be required.
             */
            key?: string;
            /**
             * The name of the Secret resource being referred to.
             */
            name?: string;
            /**
             * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
             * to the namespace of the referent.
             */
            namespace?: string;
          };
          /**
           * Value can be specified directly to set a value without using a secret.
           */
          value?: string;
        };
      };
      /**
       * Senhasegura configures this store to sync secrets using senhasegura provider
       */
      senhasegura?: {
        /**
         * Auth defines parameters to authenticate in senhasegura
         */
        auth: {
          clientId: string;
          /**
           * A reference to a specific 'key' within a Secret resource,
           * In some instances, `key` is a required field.
           */
          clientSecretSecretRef: {
            /**
             * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
             * defaulted, in others it may be required.
             */
            key?: string;
            /**
             * The name of the Secret resource being referred to.
             */
            name?: string;
            /**
             * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
             * to the namespace of the referent.
             */
            namespace?: string;
          };
        };
        /**
         * IgnoreSslCertificate defines if SSL certificate must be ignored
         */
        ignoreSslCertificate?: boolean;
        /**
         * Module defines which senhasegura module should be used to get secrets
         */
        module: string;
        /**
         * URL of senhasegura
         */
        url: string;
      };
      /**
       * Vault configures this store to sync secrets using Hashi provider
       */
      vault?: {
        /**
         * Auth configures how secret-manager authenticates with the Vault server.
         */
        auth: {
          /**
           * AppRole authenticates with Vault using the App Role auth mechanism,
           * with the role and secret stored in a Kubernetes Secret resource.
           */
          appRole?: {
            /**
             * Path where the App Role authentication backend is mounted
             * in Vault, e.g: "approle"
             */
            path: string;
            /**
             * RoleID configured in the App Role authentication backend when setting
             * up the authentication backend in Vault.
             */
            roleId?: string;
            /**
             * Reference to a key in a Secret that contains the App Role ID used
             * to authenticate with Vault.
             * The `key` field must be specified and denotes which entry within the Secret
             * resource is used as the app role id.
             */
            roleRef?: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
            /**
             * Reference to a key in a Secret that contains the App Role secret used
             * to authenticate with Vault.
             * The `key` field must be specified and denotes which entry within the Secret
             * resource is used as the app role secret.
             */
            secretRef: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
          };
          /**
           * Cert authenticates with TLS Certificates by passing client certificate, private key and ca certificate
           * Cert authentication method
           */
          cert?: {
            /**
             * ClientCert is a certificate to authenticate using the Cert Vault
             * authentication method
             */
            clientCert?: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
            /**
             * SecretRef to a key in a Secret resource containing client private key to
             * authenticate with Vault using the Cert authentication method
             */
            secretRef?: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
          };
          /**
           * Iam authenticates with vault by passing a special AWS request signed with AWS IAM credentials
           * AWS IAM authentication method
           */
          iam?: {
            /**
             * AWS External ID set on assumed IAM roles
             */
            externalID?: string;
            /**
             * Specify a service account with IRSA enabled
             */
            jwt?: {
              /**
               * A reference to a ServiceAccount resource.
               */
              serviceAccountRef?: {
                /**
                 * Audience specifies the `aud` claim for the service account token
                 * If the service account uses a well-known annotation for e.g. IRSA or GCP Workload Identity
                 * then this audiences will be appended to the list
                 */
                audiences?: string[];
                /**
                 * The name of the ServiceAccount resource being referred to.
                 */
                name: string;
                /**
                 * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
                 * to the namespace of the referent.
                 */
                namespace?: string;
              };
            };
            /**
             * Path where the AWS auth method is enabled in Vault, e.g: "aws"
             */
            path?: string;
            /**
             * AWS region
             */
            region?: string;
            /**
             * This is the AWS role to be assumed before talking to vault
             */
            role?: string;
            /**
             * Specify credentials in a Secret object
             */
            secretRef?: {
              /**
               * The AccessKeyID is used for authentication
               */
              accessKeyIDSecretRef?: {
                /**
                 * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
                 * defaulted, in others it may be required.
                 */
                key?: string;
                /**
                 * The name of the Secret resource being referred to.
                 */
                name?: string;
                /**
                 * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
                 * to the namespace of the referent.
                 */
                namespace?: string;
              };
              /**
               * The SecretAccessKey is used for authentication
               */
              secretAccessKeySecretRef?: {
                /**
                 * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
                 * defaulted, in others it may be required.
                 */
                key?: string;
                /**
                 * The name of the Secret resource being referred to.
                 */
                name?: string;
                /**
                 * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
                 * to the namespace of the referent.
                 */
                namespace?: string;
              };
              /**
               * The SessionToken used for authentication
               * This must be defined if AccessKeyID and SecretAccessKey are temporary credentials
               * see: https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_temp_use-resources.html
               */
              sessionTokenSecretRef?: {
                /**
                 * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
                 * defaulted, in others it may be required.
                 */
                key?: string;
                /**
                 * The name of the Secret resource being referred to.
                 */
                name?: string;
                /**
                 * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
                 * to the namespace of the referent.
                 */
                namespace?: string;
              };
            };
            /**
             * X-Vault-AWS-IAM-Server-ID is an additional header used by Vault IAM auth method to mitigate against different types of replay attacks. More details here: https://developer.hashicorp.com/vault/docs/auth/aws
             */
            vaultAwsIamServerID?: string;
            /**
             * Vault Role. In vault, a role describes an identity with a set of permissions, groups, or policies you want to attach a user of the secrets engine
             */
            vaultRole: string;
          };
          /**
           * Jwt authenticates with Vault by passing role and JWT token using the
           * JWT/OIDC authentication method
           */
          jwt?: {
            /**
             * Optional ServiceAccountToken specifies the Kubernetes service account for which to request
             * a token for with the `TokenRequest` API.
             */
            kubernetesServiceAccountToken?: {
              /**
               * Optional audiences field that will be used to request a temporary Kubernetes service
               * account token for the service account referenced by `serviceAccountRef`.
               * Defaults to a single audience `vault` it not specified.
               * Deprecated: use serviceAccountRef.Audiences instead
               */
              audiences?: string[];
              /**
               * Optional expiration time in seconds that will be used to request a temporary
               * Kubernetes service account token for the service account referenced by
               * `serviceAccountRef`.
               * Deprecated: this will be removed in the future.
               * Defaults to 10 minutes.
               */
              expirationSeconds?: number;
              /**
               * Service account field containing the name of a kubernetes ServiceAccount.
               */
              serviceAccountRef: {
                /**
                 * Audience specifies the `aud` claim for the service account token
                 * If the service account uses a well-known annotation for e.g. IRSA or GCP Workload Identity
                 * then this audiences will be appended to the list
                 */
                audiences?: string[];
                /**
                 * The name of the ServiceAccount resource being referred to.
                 */
                name: string;
                /**
                 * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
                 * to the namespace of the referent.
                 */
                namespace?: string;
              };
            };
            /**
             * Path where the JWT authentication backend is mounted
             * in Vault, e.g: "jwt"
             */
            path: string;
            /**
             * Role is a JWT role to authenticate using the JWT/OIDC Vault
             * authentication method
             */
            role?: string;
            /**
             * Optional SecretRef that refers to a key in a Secret resource containing JWT token to
             * authenticate with Vault using the JWT/OIDC authentication method.
             */
            secretRef?: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
          };
          /**
           * Kubernetes authenticates with Vault by passing the ServiceAccount
           * token stored in the named Secret resource to the Vault server.
           */
          kubernetes?: {
            /**
             * Path where the Kubernetes authentication backend is mounted in Vault, e.g:
             * "kubernetes"
             */
            mountPath: string;
            /**
             * A required field containing the Vault Role to assume. A Role binds a
             * Kubernetes ServiceAccount with a set of Vault policies.
             */
            role: string;
            /**
             * Optional secret field containing a Kubernetes ServiceAccount JWT used
             * for authenticating with Vault. If a name is specified without a key,
             * `token` is the default. If one is not specified, the one bound to
             * the controller will be used.
             */
            secretRef?: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
            /**
             * Optional service account field containing the name of a kubernetes ServiceAccount.
             * If the service account is specified, the service account secret token JWT will be used
             * for authenticating with Vault. If the service account selector is not supplied,
             * the secretRef will be used instead.
             */
            serviceAccountRef?: {
              /**
               * Audience specifies the `aud` claim for the service account token
               * If the service account uses a well-known annotation for e.g. IRSA or GCP Workload Identity
               * then this audiences will be appended to the list
               */
              audiences?: string[];
              /**
               * The name of the ServiceAccount resource being referred to.
               */
              name: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
          };
          /**
           * Ldap authenticates with Vault by passing username/password pair using
           * the LDAP authentication method
           */
          ldap?: {
            /**
             * Path where the LDAP authentication backend is mounted
             * in Vault, e.g: "ldap"
             */
            path: string;
            /**
             * SecretRef to a key in a Secret resource containing password for the LDAP
             * user used to authenticate with Vault using the LDAP authentication
             * method
             */
            secretRef?: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
            /**
             * Username is a LDAP user name used to authenticate using the LDAP Vault
             * authentication method
             */
            username: string;
          };
          /**
           * Name of the vault namespace to authenticate to. This can be different than the namespace your secret is in.
           * Namespaces is a set of features within Vault Enterprise that allows
           * Vault environments to support Secure Multi-tenancy. e.g: "ns1".
           * More about namespaces can be found here https://www.vaultproject.io/docs/enterprise/namespaces
           * This will default to Vault.Namespace field if set, or empty otherwise
           */
          namespace?: string;
          /**
           * TokenSecretRef authenticates with Vault by presenting a token.
           */
          tokenSecretRef?: {
            /**
             * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
             * defaulted, in others it may be required.
             */
            key?: string;
            /**
             * The name of the Secret resource being referred to.
             */
            name?: string;
            /**
             * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
             * to the namespace of the referent.
             */
            namespace?: string;
          };
          /**
           * UserPass authenticates with Vault by passing username/password pair
           */
          userPass?: {
            /**
             * Path where the UserPassword authentication backend is mounted
             * in Vault, e.g: "user"
             */
            path: string;
            /**
             * SecretRef to a key in a Secret resource containing password for the
             * user used to authenticate with Vault using the UserPass authentication
             * method
             */
            secretRef?: {
              /**
               * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
               * defaulted, in others it may be required.
               */
              key?: string;
              /**
               * The name of the Secret resource being referred to.
               */
              name?: string;
              /**
               * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
               * to the namespace of the referent.
               */
              namespace?: string;
            };
            /**
             * Username is a user name used to authenticate using the UserPass Vault
             * authentication method
             */
            username: string;
          };
        };
        /**
         * PEM encoded CA bundle used to validate Vault server certificate. Only used
         * if the Server URL is using HTTPS protocol. This parameter is ignored for
         * plain HTTP protocol connection. If not set the system root certificates
         * are used to validate the TLS connection.
         */
        caBundle?: string;
        /**
         * The provider for the CA bundle to use to validate Vault server certificate.
         */
        caProvider?: {
          /**
           * The key where the CA certificate can be found in the Secret or ConfigMap.
           */
          key?: string;
          /**
           * The name of the object located at the provider type.
           */
          name: string;
          /**
           * The namespace the Provider type is in.
           * Can only be defined when used in a ClusterSecretStore.
           */
          namespace?: string;
          /**
           * The type of provider to use such as "Secret", or "ConfigMap".
           */
          type: 'Secret' | 'ConfigMap';
        };
        /**
         * ForwardInconsistent tells Vault to forward read-after-write requests to the Vault
         * leader instead of simply retrying within a loop. This can increase performance if
         * the option is enabled serverside.
         * https://www.vaultproject.io/docs/configuration/replication#allow_forwarding_via_header
         */
        forwardInconsistent?: boolean;
        /**
         * Headers to be added in Vault request
         */
        headers?: {
          [k: string]: string;
        };
        /**
         * Name of the vault namespace. Namespaces is a set of features within Vault Enterprise that allows
         * Vault environments to support Secure Multi-tenancy. e.g: "ns1".
         * More about namespaces can be found here https://www.vaultproject.io/docs/enterprise/namespaces
         */
        namespace?: string;
        /**
         * Path is the mount path of the Vault KV backend endpoint, e.g:
         * "secret". The v2 KV secret engine version specific "/data" path suffix
         * for fetching secrets from Vault is optional and will be appended
         * if not present in specified path.
         */
        path?: string;
        /**
         * ReadYourWrites ensures isolated read-after-write semantics by
         * providing discovered cluster replication states in each request.
         * More information about eventual consistency in Vault can be found here
         * https://www.vaultproject.io/docs/enterprise/consistency
         */
        readYourWrites?: boolean;
        /**
         * Server is the connection address for the Vault server, e.g: "https://vault.example.com:8200".
         */
        server: string;
        /**
         * The configuration used for client side related TLS communication, when the Vault server
         * requires mutual authentication. Only used if the Server URL is using HTTPS protocol.
         * This parameter is ignored for plain HTTP protocol connection.
         * It's worth noting this configuration is different from the "TLS certificates auth method",
         * which is available under the `auth.cert` section.
         */
        tls?: {
          /**
           * CertSecretRef is a certificate added to the transport layer
           * when communicating with the Vault server.
           * If no key for the Secret is specified, external-secret will default to 'tls.crt'.
           */
          certSecretRef?: {
            /**
             * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
             * defaulted, in others it may be required.
             */
            key?: string;
            /**
             * The name of the Secret resource being referred to.
             */
            name?: string;
            /**
             * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
             * to the namespace of the referent.
             */
            namespace?: string;
          };
          /**
           * KeySecretRef to a key in a Secret resource containing client private key
           * added to the transport layer when communicating with the Vault server.
           * If no key for the Secret is specified, external-secret will default to 'tls.key'.
           */
          keySecretRef?: {
            /**
             * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
             * defaulted, in others it may be required.
             */
            key?: string;
            /**
             * The name of the Secret resource being referred to.
             */
            name?: string;
            /**
             * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
             * to the namespace of the referent.
             */
            namespace?: string;
          };
        };
        /**
         * Version is the Vault KV secret engine version. This can be either "v1" or
         * "v2". Version defaults to "v2".
         */
        version?: 'v1' | 'v2';
      };
      /**
       * Webhook configures this store to sync secrets using a generic templated webhook
       */
      webhook?: {
        /**
         * Body
         */
        body?: string;
        /**
         * PEM encoded CA bundle used to validate webhook server certificate. Only used
         * if the Server URL is using HTTPS protocol. This parameter is ignored for
         * plain HTTP protocol connection. If not set the system root certificates
         * are used to validate the TLS connection.
         */
        caBundle?: string;
        /**
         * The provider for the CA bundle to use to validate webhook server certificate.
         */
        caProvider?: {
          /**
           * The key the value inside of the provider type to use, only used with "Secret" type
           */
          key?: string;
          /**
           * The name of the object located at the provider type.
           */
          name: string;
          /**
           * The namespace the Provider type is in.
           */
          namespace?: string;
          /**
           * The type of provider to use such as "Secret", or "ConfigMap".
           */
          type: 'Secret' | 'ConfigMap';
        };
        /**
         * Headers
         */
        headers?: {
          [k: string]: string;
        };
        /**
         * Webhook Method
         */
        method?: string;
        /**
         * Result formatting
         */
        result: {
          /**
           * Json path of return value
           */
          jsonPath?: string;
        };
        /**
         * Secrets to fill in templates
         * These secrets will be passed to the templating function as key value pairs under the given name
         */
        secrets?: {
          /**
           * Name of this secret in templates
           */
          name: string;
          /**
           * Secret ref to fill in credentials
           */
          secretRef: {
            /**
             * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
             * defaulted, in others it may be required.
             */
            key?: string;
            /**
             * The name of the Secret resource being referred to.
             */
            name?: string;
            /**
             * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
             * to the namespace of the referent.
             */
            namespace?: string;
          };
        }[];
        /**
         * Timeout
         */
        timeout?: string;
        /**
         * Webhook url to call
         */
        url: string;
      };
      /**
       * YandexCertificateManager configures this store to sync secrets using Yandex Certificate Manager provider
       */
      yandexcertificatemanager?: {
        /**
         * Yandex.Cloud API endpoint (e.g. 'api.cloud.yandex.net:443')
         */
        apiEndpoint?: string;
        /**
         * Auth defines the information necessary to authenticate against Yandex Certificate Manager
         */
        auth: {
          /**
           * The authorized key used for authentication
           */
          authorizedKeySecretRef?: {
            /**
             * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
             * defaulted, in others it may be required.
             */
            key?: string;
            /**
             * The name of the Secret resource being referred to.
             */
            name?: string;
            /**
             * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
             * to the namespace of the referent.
             */
            namespace?: string;
          };
        };
        /**
         * The provider for the CA bundle to use to validate Yandex.Cloud server certificate.
         */
        caProvider?: {
          /**
           * A reference to a specific 'key' within a Secret resource,
           * In some instances, `key` is a required field.
           */
          certSecretRef?: {
            /**
             * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
             * defaulted, in others it may be required.
             */
            key?: string;
            /**
             * The name of the Secret resource being referred to.
             */
            name?: string;
            /**
             * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
             * to the namespace of the referent.
             */
            namespace?: string;
          };
        };
      };
      /**
       * YandexLockbox configures this store to sync secrets using Yandex Lockbox provider
       */
      yandexlockbox?: {
        /**
         * Yandex.Cloud API endpoint (e.g. 'api.cloud.yandex.net:443')
         */
        apiEndpoint?: string;
        /**
         * Auth defines the information necessary to authenticate against Yandex Lockbox
         */
        auth: {
          /**
           * The authorized key used for authentication
           */
          authorizedKeySecretRef?: {
            /**
             * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
             * defaulted, in others it may be required.
             */
            key?: string;
            /**
             * The name of the Secret resource being referred to.
             */
            name?: string;
            /**
             * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
             * to the namespace of the referent.
             */
            namespace?: string;
          };
        };
        /**
         * The provider for the CA bundle to use to validate Yandex.Cloud server certificate.
         */
        caProvider?: {
          /**
           * A reference to a specific 'key' within a Secret resource,
           * In some instances, `key` is a required field.
           */
          certSecretRef?: {
            /**
             * The key of the entry in the Secret resource's `data` field to be used. Some instances of this field may be
             * defaulted, in others it may be required.
             */
            key?: string;
            /**
             * The name of the Secret resource being referred to.
             */
            name?: string;
            /**
             * Namespace of the resource being referred to. Ignored if referent is not cluster-scoped. cluster-scoped defaults
             * to the namespace of the referent.
             */
            namespace?: string;
          };
        };
      };
    };
    /**
     * Used to configure store refresh interval in seconds. Empty or 0 will default to the controller config.
     */
    refreshInterval?: number;
    /**
     * Used to configure http retries if failed
     */
    retrySettings?: {
      maxRetries?: number;
      retryInterval?: string;
    };
  };
  /**
   * SecretStoreStatus defines the observed state of the SecretStore.
   */
  status?: {
    /**
     * SecretStoreCapabilities defines the possible operations a SecretStore can do.
     */
    capabilities?: string;
    conditions?: {
      lastTransitionTime?: string;
      message?: string;
      reason?: string;
      status: string;
      type: string;
    }[];
  };
}
