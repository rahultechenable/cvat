// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import { ThemeConfig } from 'antd/lib/config-provider';

// Keep in sync with the palette in base.scss
export const colors = {
    primary: '#7c3aed',
    primaryHover: '#6d28d9',
    primaryLight: '#f3effe',
    text: '#111827',
    textSecondary: '#6b7280',
    border: '#e6e6ef',
    background: '#f7f7fb',
    surface: '#ffffff',
};

const theme: ThemeConfig = {
    token: {
        colorPrimary: colors.primary,
        colorInfo: colors.primary,
        colorLink: colors.primary,
        colorLinkHover: colors.primaryHover,
        colorText: colors.text,
        colorTextSecondary: colors.textSecondary,
        colorBorder: '#dcdce6',
        colorBorderSecondary: colors.border,
        colorBgLayout: colors.background,
        borderRadius: 8,
        borderRadiusLG: 12,
        fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
        boxShadowTertiary: '0 1px 2px rgba(16, 24, 40, 0.06)',
    },
    components: {
        Layout: {
            headerBg: colors.surface,
            siderBg: colors.surface,
            bodyBg: colors.background,
        },
        Button: {
            primaryShadow: 'none',
            defaultShadow: 'none',
            fontWeight: 500,
        },
        Card: {
            borderRadiusLG: 12,
        },
        Tabs: {
            itemSelectedColor: colors.primary,
            inkBarColor: colors.primary,
        },
        Menu: {
            itemSelectedBg: colors.primaryLight,
            itemSelectedColor: colors.primary,
            itemBorderRadius: 8,
        },
    },
};

export default theme;
