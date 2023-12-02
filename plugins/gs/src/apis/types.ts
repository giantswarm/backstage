type BaseRequestResult = {
  installationName: string;
}

export type FulfilledRequestResult<T> = BaseRequestResult & {
  status: 'fulfilled',
  value: T[];
};

export type RejectedRequestResult = BaseRequestResult & {
  status: 'rejected',
  reason: any;
}

export type RequestResult<T> = FulfilledRequestResult<T> | RejectedRequestResult;

export type Resource<T> = T & {
  installationName: string;
}
