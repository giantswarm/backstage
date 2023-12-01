import useLocalStorageState from 'use-local-storage-state';

export const useInstallations = (): [string[], React.Dispatch<React.SetStateAction<string[]>>] => {
  const [value, setValue] = useLocalStorageState<string[]>('gs-installations', {
    defaultValue: []
  });

  return [value, setValue];
}
