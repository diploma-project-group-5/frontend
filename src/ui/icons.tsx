import type { ReactNode, SVGProps } from 'react';

/** Іконки з прототипу «Лад» (stroke, currentColor). */

type P = SVGProps<SVGSVGElement>;

const base = (viewBox: string, children: ReactNode, strokeWidth = 1.6) =>
  function Icon(props: P) {
    return (
      <svg
        width="18"
        height="18"
        viewBox={viewBox}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        {...props}
      >
        {children}
      </svg>
    );
  };

export const IconSchool = base(
  '0 0 24 24',
  <>
    <path d="M12 3v3.5M12 3h4l-1 1.2 1 1.3h-4" />
    <path d="m3 11 9-5 9 5" />
    <path d="M5 10v10h14V10" />
    <path d="M10 20v-4.5a2 2 0 0 1 4 0V20" />
    <path d="M8 13h.01M16 13h.01" />
  </>,
  1.8,
);

export const IconDb = base(
  '0 0 16 16',
  <>
    <ellipse cx="8" cy="3.5" rx="5.5" ry="2" />
    <path d="M2.5 3.5v9c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2v-9M2.5 8c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2" />
  </>,
);

export const IconGrid = base(
  '0 0 16 16',
  <>
    <rect x="2" y="2" width="12" height="12" rx="2" />
    <path d="M2 6h12M2 10h12M6 2v12M10 2v12" />
  </>,
);

export const IconCheck = base('0 0 16 16', <path d="M2 8.5 6 12l8-8" />);

export const IconSwap = base('0 0 16 16', <path d="M2 5h10l-3-3M14 11H4l3 3" />);

export const IconLayers = base(
  '0 0 16 16',
  <>
    <path d="M8 2 14 5 8 8 2 5z" />
    <path d="M2 8l6 3 6-3M2 11l6 3 6-3" />
  </>,
);

export const IconLog = base(
  '0 0 16 16',
  <>
    <rect x="3" y="2" width="10" height="12" rx="1.5" />
    <path d="M5.5 5.5h5M5.5 8h5M5.5 10.5h3" />
  </>,
);

export const IconQr = base(
  '0 0 16 16',
  <>
    <rect x="2" y="2" width="5" height="5" rx="1" />
    <rect x="9" y="2" width="5" height="5" rx="1" />
    <rect x="2" y="9" width="5" height="5" rx="1" />
    <path d="M9 9h2v2M13 9v5h-4" />
  </>,
);

export const IconRefresh = base(
  '0 0 16 16',
  <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v3h-3" />,
);

export const IconWarn = base(
  '0 0 16 16',
  <>
    <path d="M8 1.8 15 14H1z" />
    <path d="M8 6v4M8 12v.5" />
  </>,
  1.8,
);

export const IconOk = base('0 0 16 16', <path d="m3 8.5 3 3 7-7" />, 2);
