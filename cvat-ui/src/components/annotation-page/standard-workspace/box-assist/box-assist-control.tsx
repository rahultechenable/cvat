// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React, { useEffect } from 'react';
import { useSelector } from 'react-redux';
import { Row, Col } from 'antd/lib/grid';
import { ThunderboltOutlined, ReloadOutlined } from '@ant-design/icons';
import Button from 'antd/lib/button';
import Popover from 'antd/lib/popover';
import Select from 'antd/lib/select';
import Slider from 'antd/lib/slider';
import Switch from 'antd/lib/switch';
import Text from 'antd/lib/typography/Text';
import Alert from 'antd/lib/alert';

import { CombinedState } from 'reducers';
import CVATTooltip from 'components/common/cvat-tooltip';
import withVisibilityHandling from '../controls-side-bar/handle-popover-visibility';
import {
    useBoxAssistState, updateBoxAssistState, fetchBoxAssistModels, requestPrediction,
} from './box-assist-store';
import './styles.scss';

const CustomPopover = withVisibilityHandling(Popover, 'box-assist-control');
const MAX_LISTED_CLASSES = 8;

function BoxAssistControlComponent(): JSX.Element {
    const {
        enabled, modelId, threshold, autoPredict, models, modelsFetching, modelsError,
    } = useBoxAssistState();
    const normalizedKeyMap = useSelector((state: CombinedState) => state.shortcuts.normalizedKeyMap);

    useEffect(() => {
        if (models === null) {
            fetchBoxAssistModels();
        }
    }, []);

    const selectedModel = models?.find((model) => model.id === modelId);

    const popoverContent = (
        <div className='cvat-box-assist-popover-content'>
            <Row justify='space-between' align='middle'>
                <Col>
                    <Text className='cvat-text-color' strong>Box Assist</Text>
                </Col>
                <Col>
                    <Switch
                        className='cvat-box-assist-enabled-switch'
                        checked={enabled}
                        onChange={(value) => updateBoxAssistState({ enabled: value })}
                    />
                </Col>
            </Row>
            <Row>
                <Col span={24}>
                    <Text type='secondary'>
                        Suggests boxes on each frame. Accept them instead of drawing.
                    </Text>
                </Col>
            </Row>

            <Row className='cvat-box-assist-row' align='middle' gutter={8}>
                <Col flex='auto'>
                    <Select
                        className='cvat-box-assist-model-select'
                        placeholder='Select a model'
                        value={selectedModel ? modelId : undefined}
                        loading={modelsFetching}
                        disabled={!models?.length}
                        onChange={(value: string) => updateBoxAssistState({ modelId: value })}
                        options={(models ?? []).map((model) => ({ value: model.id, label: model.name }))}
                    />
                </Col>
                <Col>
                    <CVATTooltip title='Reload the model list'>
                        <Button
                            icon={<ReloadOutlined />}
                            loading={modelsFetching}
                            onClick={() => fetchBoxAssistModels()}
                        />
                    </CVATTooltip>
                </Col>
            </Row>
            {modelsError && (
                <Alert className='cvat-box-assist-row' type='error' showIcon message={modelsError} />
            )}
            {models && !models.length && (
                <Alert
                    className='cvat-box-assist-row'
                    type='warning'
                    showIcon
                    message='No models found. Put a .pt or .onnx file in the Box Assist models folder.'
                />
            )}
            {selectedModel && (
                <Row>
                    <Col span={24}>
                        <CVATTooltip title={selectedModel.labels.join(', ')}>
                            <Text type='secondary' className='cvat-box-assist-model-labels'>
                                {selectedModel.labels.length > MAX_LISTED_CLASSES ?
                                    `${selectedModel.labels.length} classes: ` +
                                    `${selectedModel.labels.slice(0, MAX_LISTED_CLASSES).join(', ')}, ` +
                                    `+${selectedModel.labels.length - MAX_LISTED_CLASSES} more` :
                                    `Classes: ${selectedModel.labels.join(', ')}`}
                            </Text>
                        </CVATTooltip>
                    </Col>
                </Row>
            )}

            <Row className='cvat-box-assist-row' align='middle'>
                <Col span={24}>
                    <Text>{`Confidence threshold: ${Math.round(threshold * 100)}%`}</Text>
                    <Slider
                        className='cvat-box-assist-threshold-slider'
                        min={0.05}
                        max={1}
                        step={0.01}
                        value={threshold}
                        tooltip={{ formatter: (value) => `${Math.round((value ?? 0) * 100)}%` }}
                        onChange={(value: number) => updateBoxAssistState({ threshold: value })}
                    />
                </Col>
            </Row>
            <Row className='cvat-box-assist-row' justify='space-between' align='middle'>
                <Col>
                    <Text>Predict automatically on frame change</Text>
                </Col>
                <Col>
                    <Switch
                        size='small'
                        checked={autoPredict}
                        onChange={(value) => updateBoxAssistState({ autoPredict: value })}
                    />
                </Col>
            </Row>
            <Row className='cvat-box-assist-row'>
                <Col span={24}>
                    <Button
                        block
                        type='primary'
                        className='cvat-box-assist-predict-button'
                        disabled={!enabled || !selectedModel}
                        onClick={() => requestPrediction()}
                    >
                        {`Predict on this frame ${normalizedKeyMap.BOX_ASSIST_PREDICT ?? ''}`}
                    </Button>
                </Col>
            </Row>
        </div>
    );

    return (
        <CustomPopover
            placement='right'
            overlayClassName='cvat-box-assist-popover'
            content={popoverContent}
        >
            <ThunderboltOutlined
                className={`cvat-box-assist-control ${enabled ? 'cvat-box-assist-control-active' : ''}`}
            />
        </CustomPopover>
    );
}

export default React.memo(BoxAssistControlComponent);
