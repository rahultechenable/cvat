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

export const BRAND_MARK_URL = '/assets/samiksha-mark.png';
export const BRAND_LOGO_URL = '/assets/samiksha-logo.png';

// the Samiksha.ai mark, without the wordmark
export function BrandMark({ size = 40 }: { size?: number }): JSX.Element {
    return (
        <img
            src={BRAND_MARK_URL}
            width={size}
            height={size}
            alt=''
            aria-hidden='true'
            className='cvat-brand-mark'
        />
    );
}

// the full Samiksha.ai logo with the wordmark
export function BrandFullLogo({ height = 64 }: { height?: number }): JSX.Element {
    return <img src={BRAND_LOGO_URL} alt='Samiksha.ai' style={{ height }} className='cvat-brand-full-logo' />;
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
