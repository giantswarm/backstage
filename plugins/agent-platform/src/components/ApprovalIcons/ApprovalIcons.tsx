import type { SVGProps } from 'react';

/**
 * Giant Swarm styled icons for the approval prompt and the sign-in prompt in
 * the chat. Giant Swarm's web icons are thin geometric outlines drawn as
 * inline SVG with `stroke="currentColor"`, round caps and joins (loom,
 * PATTERNS.md §6.1: stroke width 3 for the chunky marks, a thinner outline for
 * the pictogram around them). They are decorative: the heading beside each one
 * carries the meaning, so they are `aria-hidden`.
 */
type IconProps = Omit<SVGProps<SVGSVGElement>, 'children'>;

function Icon({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1.25em"
      height="1.25em"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

/** A shield with a check: a tool call waits for the person's approval. */
export function ApprovalShieldIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path
        d="M12 2.5 4 5.5v6c0 4.7 3.2 8.3 8 10 4.8-1.7 8-5.3 8-10v-6z"
        strokeWidth="2"
      />
      <polyline points="8.5 12 11 14.5 15.5 9.5" strokeWidth="3" />
    </Icon>
  );
}

/** A triangle with an exclamation mark: the request comes from another agent. */
export function ApprovalWarningIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3 2.5 20h19z" strokeWidth="2" />
      <line x1="12" y1="10" x2="12" y2="14" strokeWidth="3" />
      <line x1="12" y1="17.2" x2="12" y2="17.3" strokeWidth="3" />
    </Icon>
  );
}

/** A key: the agent needs the person to sign in to a connector or open a page. */
export function SignInKeyIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="8" cy="15" r="4.5" strokeWidth="2" />
      <path d="M11.2 11.8 20 3m-3 3 3 3m-5.5-.5 2 2" strokeWidth="2" />
    </Icon>
  );
}
