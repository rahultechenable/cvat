// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import './styles.scss';
import React from 'react';
import Layout from 'antd/lib/layout';
import { Row } from 'antd/lib/grid';
import Title from 'antd/lib/typography/Title';
import { CheckCircleFilled } from '@ant-design/icons';
import CVATLogo from 'components/common/cvat-logo';
import { BRAND_FULL_NAME } from 'branding';

interface SignInLayoutComponentProps {
    children: JSX.Element | JSX.Element[];
}

interface Sizes {
    xs?: { span: number };
    sm?: { span: number };
    md?: { span: number };
    lg?: { span: number };
    xl?: { span: number };
    xxl?: { span: number };
}

interface FormSizes {
    wrapper: Sizes;
    form: Sizes;
}

export const formSizes: FormSizes = {
    wrapper: {
        xs: { span: 24 },
        sm: { span: 24 },
        md: { span: 24 },
        lg: { span: 24 },
        xl: { span: 15 },
        xxl: { span: 12 },
    },
    form: {
        xs: { span: 14 },
        sm: { span: 14 },
        md: { span: 14 },
        lg: { span: 14 },
        xl: { span: 16 },
        xxl: { span: 16 },
    },
};

const highlights = [
    'Box Assist suggests boxes for you, just accept or adjust them',
    'Images and video, with projects, tasks and review stages',
    'Export to the dataset formats your models train on',
];

function SignInLayout(props: SignInLayoutComponentProps): JSX.Element {
    const { children } = props;
    const { Content } = Layout;

    return (
        <Layout className='cvat-signing-layout cvat-brand-signing-layout'>
            <div className='cvat-brand-signing-panel'>
                <CVATLogo tone='dark' />
                <div className='cvat-brand-signing-panel-body'>
                    <Title className='cvat-brand-signing-headline'>
                        Label your data faster with AI-assisted annotation
                    </Title>
                    <ul className='cvat-brand-signing-highlights'>
                        {highlights.map((item) => (
                            <li key={item}>
                                <CheckCircleFilled />
                                <span>{item}</span>
                            </li>
                        ))}
                    </ul>
                </div>
                <div className='cvat-brand-signing-panel-footer'>{BRAND_FULL_NAME}</div>
            </div>
            <Content className='cvat-brand-signing-content'>
                <div className='cvat-brand-signing-mobile-logo'>
                    <CVATLogo />
                </div>
                <Row justify='center' align='middle' className='cvat-brand-signing-form-row'>
                    {children}
                </Row>
            </Content>
        </Layout>
    );
}

export default SignInLayout;
