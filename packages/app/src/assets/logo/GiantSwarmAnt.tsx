/**
 * The ant from the Giant Swarm lockup, in its brand colors. Shared by the full
 * lockup and the standalone mark, which crop the same artwork out of the
 * lockup's user space — so the two stay in sync by construction.
 *
 * The caller owns the gradient id, because several instances can be mounted in
 * one document and `fill="url(#...)"` resolves document-wide.
 */

/**
 * Crop around the ant (bounding box `99.98 95.29 68.74 61.45`) for use without
 * the wordmark.
 *
 * It deliberately keeps the lockup's own vertical framing — same y origin, same
 * 67-unit height — and the same 2.48 units of padding on the left. Both forms
 * are rendered at a fixed height, so sharing the height means sharing the scale,
 * and the ant lands on exactly the same pixels in both. Re-cropping this tighter
 * makes the logo jump when the sidebar expands.
 */
export const ANT_VIEW_BOX = '97.5 93 73.7 67';

export const GiantSwarmAntPaths = ({ gradientId }: { gradientId: string }) => (
  <>
    <linearGradient
      id={gradientId}
      gradientUnits="userSpaceOnUse"
      x1="104.3744"
      y1="541.5061"
      x2="104.3744"
      y2="369.4181"
      gradientTransform="matrix(0.3571 0 0 0.3571 97.0779 -36.6321)"
    >
      <stop offset="0" stopColor="#E14760" />
      <stop offset="1" stopColor="#FA8816" />
    </linearGradient>
    <path
      fill={`url(#${gradientId})`}
      d="M168.5,116.8l-16.2-20.7c-0.9-1.1-2.7-1.1-3.5,0.1l-6.9,9.8c-2.2-1.2-4.7-1.9-7.4-1.9
        c-2.9,0-5.6,0.7-7.9,2l-6.6-9.6c-0.8-1.2-2.6-1.3-3.5-0.1l-16.3,20.7c-0.7,0.8,0.4,1.9,1.3,1.2l14-12.4c0.4-0.4,1.1-0.3,1.4,0.1
        l1.7,5.4c-8,1.9-13.9,9.1-13.8,17.7c0,9.6,7.4,17.4,16.9,18.1c0.3,3.5,2.3,7.3,8.6,9.5c0.5,0.2,0.9-0.4,0.6-0.8
        c-0.6-0.8-1.3-2-1.5-3.3c1.5,0.5,3.1,0.8,4.8,0.8c1.5,0,3-0.3,4.3-0.7c-0.3,1.2-0.9,2.3-1.5,3.1c-0.3,0.4,0.1,1,0.6,0.8
        c6.4-2.3,8.6-6.1,9-9.5c9.8-0.3,17.7-8.4,17.6-18.2c0-8.6-6.1-15.9-14.2-17.7l1.8-5.6c0.4-0.4,1-0.5,1.4-0.1l14,12.4
        C168.1,118.7,169.2,117.6,168.5,116.8z"
    />
    <ellipse
      transform="matrix(0.8521 -0.5233 0.5233 0.8521 -50.9484 81.9271)"
      fill="#FFFFFF"
      cx="119.5"
      cy="131.1"
      rx="9.6"
      ry="13"
    />
    <path
      fill="#E54D42"
      d="M115.7,136.9c0,0-0.2-0.6-0.2-1.6c0-1.1,0.2-1.6,0.2-1.6l4.9-2.1l-4.9-2.1c0,0-0.2-0.6-0.2-1.6
        c0-1.1,0.2-1.6,0.2-1.6l8.4,3.6c0,0,0.2,0.6,0.2,1.7c0,1-0.2,1.7-0.2,1.7L115.7,136.9z"
    />
    <ellipse
      transform="matrix(-0.8521 -0.5233 0.5233 -0.8521 208.4114 321.0699)"
      fill="#FFFFFF"
      cx="149.6"
      cy="131.1"
      rx="9.7"
      ry="13.1"
    />
    <path
      fill="#E54D42"
      d="M143.6,133.2c0,0-0.2-0.4-0.2-1.5c0-1.1,0.2-1.5,0.2-1.5h11.2c0,0,0.2,0.4,0.2,1.5c0,1.1-0.2,1.5-0.2,1.5
        H143.6z"
    />
  </>
);
