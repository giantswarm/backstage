// eslint-disable-next-line no-restricted-imports
import * as Icons from '@material-ui/icons';
import * as CustomIcons from '../../../assets/icons/CustomIcons';

const IconResolver = ({ iconName, ...props }: { iconName: string }) => {
  const IconComponent =
    (CustomIcons as Record<string, React.ElementType>)[iconName] ||
    (Icons as Record<string, React.ElementType>)[iconName];

  if (!IconComponent) {
    // eslint-disable-next-line no-console
    console.error(`Icon "${iconName}" not found`);
    return null;
  }

  return <IconComponent {...props} />;
};

export default IconResolver;
