import { ColorVariant } from '../components/UI/colors/makeColorVariants';

export function getResourceColorVariant(kind: string) {
  let variant: ColorVariant;
  switch (kind) {
    case 'GitRepository':
      variant = 'purple';
      break;
    case 'HelmRelease':
      variant = 'pink';
      break;
    case 'HelmRepository':
      variant = 'blue';
      break;
    case 'Kustomization':
      variant = 'orange';
      break;

    default:
      variant = 'gray';
      break;
  }

  return variant;
}
