type BaseRequestResult = {
  installationName: string;
}

export type FulfilledRequestResult<T> = BaseRequestResult & {
  status: 'fulfilled';
  value: T[];
};

export type RejectedRequestResult = BaseRequestResult & {
  status: 'rejected';
  reason: any;
}

export type InProgressRequestResult = BaseRequestResult & {
  status: 'loading';
}

export type RequestResult<T> = InProgressRequestResult | FulfilledRequestResult<T> | RejectedRequestResult;

export type Resource<T> = T & {
  installationName: string;
}
