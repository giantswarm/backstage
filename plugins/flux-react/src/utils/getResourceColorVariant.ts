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
    case 'OCIRepository':
      variant = 'teal';
      break;
    case 'ImagePolicy':
      variant = 'green';
      break;
    case 'ImageRepository':
      variant = 'yellow';
      break;
    case 'ImageUpdateAutomation':
      variant = 'brown';
      break;
    case 'FluxInstance':
      variant = 'indigo';
      break;
    case 'ResourceSet':
      variant = 'cyan';
      break;
    case 'ResourceSetInputProvider':
      variant = 'lime';
      break;
    case 'FluxReport':
      variant = 'slate';
      break;

    default:
      variant = 'gray';
      break;
  }

  return variant;
}
