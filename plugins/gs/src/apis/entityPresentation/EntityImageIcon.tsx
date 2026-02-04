import { useState } from 'react';
import { IconComponent } from '@backstage/core-plugin-api';
import { makeStyles } from '@material-ui/core/styles';

const useStyles = makeStyles({
  image: {
    width: '20px',
    height: '20px',
    marginRight: '4px',
    display: 'inline-block',
    verticalAlign: 'middle',
    objectFit: 'contain',
  },
});

/**
 * Creates an IconComponent-compatible wrapper for an image URL
 */
export function createImageIcon(imageUrl: string): IconComponent {
  const ImageIcon: IconComponent = ({ fontSize }) => {
    const classes = useStyles();
    const [hasError, setHasError] = useState(false);

    if (hasError) {
      return null; // Fall back to default icon
    }

    return (
      <img
        src={imageUrl}
        alt=""
        className={classes.image}
        style={{ fontSize }}
        onError={() => setHasError(true)}
      />
    );
  };

  return ImageIcon;
}
