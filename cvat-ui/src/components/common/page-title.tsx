// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React from 'react';
import { Row, Col } from 'antd/lib/grid';
import Text from 'antd/lib/typography/Text';
import dimensions from 'utils/dimensions';

interface Props {
    title: string;
    subtitle?: string;
}

function PageTitle({ title, subtitle }: Props): JSX.Element {
    return (
        <Row className='cvat-brand-page-title-wrapper' justify='center'>
            <Col {...dimensions}>
                <h1 className='cvat-brand-page-title'>{title}</h1>
                {subtitle && <Text type='secondary' className='cvat-brand-page-subtitle'>{subtitle}</Text>}
            </Col>
        </Row>
    );
}

export default React.memo(PageTitle);
