// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React from 'react';
import { BRAND_NAME, BRAND_OWNER, BRAND_FULL_NAME } from 'branding';

interface Props {
    // 'mark' shows only the square icon (for collapsed navigation)
    variant?: 'full' | 'mark';
    // 'dark' is for dark backgrounds
    tone?: 'light' | 'dark';
}

export function BrandMark({ size = 32 }: { size?: number }): JSX.Element {
    return (
        <svg width={size} height={size} viewBox='0 0 32 32' aria-hidden='true' className='cvat-brand-mark'>
            <defs>
                <linearGradient id='brand-mark-gradient' x1='0' y1='0' x2='32' y2='32' gradientUnits='userSpaceOnUse'>
                    <stop offset='0' stopColor='#8b5cf6' />
                    <stop offset='1' stopColor='#6d28d9' />
                </linearGradient>
            </defs>
            <rect width='32' height='32' rx='9' fill='url(#brand-mark-gradient)' />
            {/* corners of a bounding box around a point of interest */}
            <path
                d='M9 13V9h4M19 9h4v4M23 19v4h-4M13 23H9v-4'
                fill='none'
                stroke='white'
                strokeWidth='2.4'
                strokeLinecap='round'
                strokeLinejoin='round'
            />
            <circle cx='16' cy='16' r='3' fill='white' />
        </svg>
    );
}

function CVATLogo({ variant = 'full', tone = 'light' }: Props): JSX.Element {
    return (
        <div className={`cvat-logo-icon cvat-brand-logo cvat-brand-logo-${tone}`} title={BRAND_FULL_NAME}>
            <BrandMark />
            {variant === 'full' && (
                <div className='cvat-brand-logo-text'>
                    <span className='cvat-brand-logo-name'>{BRAND_NAME}</span>
                    <span className='cvat-brand-logo-owner'>{`by ${BRAND_OWNER}`}</span>
                </div>
            )}
        </div>
    );
}

export default React.memo(CVATLogo);
