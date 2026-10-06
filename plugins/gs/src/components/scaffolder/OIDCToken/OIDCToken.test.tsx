import { render } from '@testing-library/react';
import { OIDCToken } from './OIDCToken';
import { OIDCTokenProps } from './schema';

function fieldProps(
  options: object,
  formData: object = {},
): OIDCTokenProps & { onChange: jest.Mock } {
  return {
    uiSchema: { 'ui:options': { secretsKey: 'USER_OIDC_TOKEN', ...options } },
    formContext: { formData },
    onChange: jest.fn(),
  } as unknown as OIDCTokenProps & { onChange: jest.Mock };
}

describe('OIDCToken', () => {
  it('records the installation named in its options', () => {
    const props = fieldProps({ installationName: 'golem' });

    render(<OIDCToken {...props} />);

    expect(props.onChange).toHaveBeenCalledWith({
      oidcTokenInstallation: 'golem',
    });
  });

  it('records the installation another field holds', () => {
    const props = fieldProps(
      { installationNameField: 'target.installation' },
      { target: { installation: 'gazelle' } },
    );

    render(<OIDCToken {...props} />);

    expect(props.onChange).toHaveBeenCalledWith({
      oidcTokenInstallation: 'gazelle',
    });
  });

  it('records nothing without an installation', () => {
    const props = fieldProps({ installationNameField: 'installation' });

    render(<OIDCToken {...props} />);

    expect(props.onChange).not.toHaveBeenCalled();
  });
});
