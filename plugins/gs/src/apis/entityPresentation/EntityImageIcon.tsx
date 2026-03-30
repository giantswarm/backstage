import { IconComponent } from '@backstage/core-plugin-api';
import SvgIcon from '@material-ui/core/SvgIcon';

/**
 * Creates an IconComponent-compatible wrapper for an image URL.
 * Uses SvgIcon with an SVG <image> element so it renders correctly
 * in both HTML contexts and SVG contexts (e.g. catalog relations graph).
 */
export function createImageIcon(imageUrl: string): IconComponent {
  const ImageIcon: IconComponent = props => {
    return (
      <SvgIcon
        {...props}
        viewBox="0 0 20 20"
        fontSize="small"
        style={{ marginRight: 4 }}
      >
        <image href={imageUrl} width="20" height="20" />
      </SvgIcon>
    );
  };

  return ImageIcon;
}
