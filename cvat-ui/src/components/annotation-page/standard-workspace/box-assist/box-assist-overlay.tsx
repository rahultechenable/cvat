// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React, {
    useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { useDispatch, useSelector, shallowEqual } from 'react-redux';
import { LoadingOutlined, ThunderboltOutlined } from '@ant-design/icons';
import Button from 'antd/lib/button';
import Text from 'antd/lib/typography/Text';

import { CombinedState, Workspace } from 'reducers';
import { Canvas, CanvasMode } from 'cvat-canvas-wrapper';
import {
    getCore, DimensionType, ObjectType, ShapeType,
} from 'cvat-core-wrapper';
import { createAnnotationsAsync } from 'actions/annotation-actions';
import { registerComponentShortcuts } from 'actions/shortcuts-actions';
import GlobalHotKeys from 'utils/mousetrap-react';
import { subKeyMap } from 'utils/component-subkeymap';
import { ShortcutScope } from 'utils/enums';
import { ThunkDispatch } from 'utils/redux';
import { useBoxAssistState, fetchSuggestions, requestPrediction } from './box-assist-store';
import './styles.scss';

const core = getCore();

// suggestions overlapping an existing box more than this are considered already annotated
const EXISTING_BOX_IOU_THRESHOLD = 0.5;
const AUTO_PREDICT_DELAY_MS = 300;

const componentShortcuts = {
    BOX_ASSIST_PREDICT: {
        name: 'Box Assist: predict',
        description: 'Run the Box Assist model on the current frame',
        sequences: ['w'],
        scope: ShortcutScope.STANDARD_WORKSPACE,
    },
    BOX_ASSIST_ACCEPT: {
        name: 'Box Assist: accept suggestion',
        description: 'Accept the selected suggestion, or the most confident one if none is selected',
        sequences: ['a'],
        scope: ShortcutScope.STANDARD_WORKSPACE,
    },
    BOX_ASSIST_ACCEPT_ALL: {
        name: 'Box Assist: accept all',
        description: 'Accept all the suggestions on the current frame',
        sequences: ['shift+a'],
        scope: ShortcutScope.STANDARD_WORKSPACE,
    },
    BOX_ASSIST_REJECT: {
        name: 'Box Assist: reject suggestion',
        description: 'Reject the selected suggestion, or the most confident one if none is selected',
        sequences: ['shift+x'],
        scope: ShortcutScope.STANDARD_WORKSPACE,
    },
};

registerComponentShortcuts(componentShortcuts);

interface Suggestion {
    id: number;
    labelID: number;
    modelLabel: string;
    confidence: number;
    points: number[];
}

interface FrameSuggestions {
    modelId: string;
    suggestions: Suggestion[];
    unmatchedLabels: string[];
}

function normalizeBox(box: number[]): number[] {
    return [
        Math.min(box[0], box[2]), Math.min(box[1], box[3]),
        Math.max(box[0], box[2]), Math.max(box[1], box[3]),
    ];
}

function iou(a: number[], b: number[]): number {
    const [ax1, ay1, ax2, ay2] = normalizeBox(a);
    const [bx1, by1, bx2, by2] = normalizeBox(b);
    const intersection = Math.max(0, Math.min(ax2, bx2) - Math.max(ax1, bx1)) *
        Math.max(0, Math.min(ay2, by2) - Math.max(ay1, by1));
    const union = (ax2 - ax1) * (ay2 - ay1) + (bx2 - bx1) * (by2 - by1) - intersection;
    return union > 0 ? intersection / union : 0;
}

function BoxAssistOverlay(): JSX.Element | null {
    const dispatch = useDispatch<ThunkDispatch>();
    const {
        jobInstance, frameNumber, frameFetching, frameDeleted, states, labels,
        canvasInstance, zLayer, workspace, keyMap, normalizedKeyMap,
    } = useSelector((state: CombinedState) => ({
        jobInstance: state.annotation.job.instance,
        frameNumber: state.annotation.player.frame.number,
        frameFetching: state.annotation.player.frame.fetching,
        frameDeleted: !!state.annotation.player.frame.data?.deleted,
        states: state.annotation.annotations.states,
        labels: state.annotation.job.labels,
        canvasInstance: state.annotation.canvas.instance,
        zLayer: state.annotation.annotations.zLayer.cur,
        workspace: state.annotation.workspace,
        keyMap: state.shortcuts.keyMap,
        normalizedKeyMap: state.shortcuts.normalizedKeyMap,
    }), shallowEqual);
    const {
        enabled, modelId, threshold, autoPredict, predictRequest,
    } = useBoxAssistState();

    // per-frame model results for the current job and model, and the suggestions dismissed on each frame
    const cacheRef = useRef(new Map<number, FrameSuggestions>());
    const dismissedRef = useRef(new Map<number, Set<number>>());
    const inFlightRef = useRef(new Set<string>());
    const nextIDRef = useRef(1);
    const [cacheVersion, setCacheVersion] = useState(0);
    const [fetchingFrames, setFetchingFrames] = useState<number[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [selectedID, setSelectedID] = useState<number | null>(null);

    const jobID = jobInstance?.id ?? null;
    const active = enabled && !!modelId && !!jobInstance &&
        workspace === Workspace.STANDARD &&
        jobInstance.dimension === DimensionType.DIMENSION_2D &&
        canvasInstance instanceof Canvas;

    const labelsByID = useMemo(
        () => Object.fromEntries(labels.map((label) => [label.id as number, label])),
        [labels],
    );

    useEffect(() => {
        cacheRef.current.clear();
        dismissedRef.current.clear();
        setError(null);
        setCacheVersion((version) => version + 1);
    }, [jobID, modelId]);

    useEffect(() => {
        setSelectedID(null);
    }, [frameNumber]);

    const predict = useCallback(async (frame: number): Promise<void> => {
        if (jobID === null || !modelId) {
            return;
        }

        const key = `${jobID}:${modelId}:${frame}`;
        if (inFlightRef.current.has(key)) {
            return;
        }

        inFlightRef.current.add(key);
        setFetchingFrames((frames) => [...frames, frame]);
        setError(null);
        try {
            const result = await fetchSuggestions(jobID, frame, modelId);
            cacheRef.current.set(frame, {
                modelId,
                unmatchedLabels: result.unmatched_labels,
                suggestions: result.suggestions.map((suggestion) => ({
                    id: nextIDRef.current++,
                    labelID: suggestion.label_id,
                    modelLabel: suggestion.model_label,
                    confidence: suggestion.confidence,
                    points: suggestion.points,
                })),
            });
            dismissedRef.current.delete(frame);
        } catch (requestError: unknown) {
            setError(requestError instanceof Error ? requestError.message : String(requestError));
        } finally {
            inFlightRef.current.delete(key);
            setFetchingFrames((frames) => frames.filter((_frame) => _frame !== frame));
            setCacheVersion((version) => version + 1);
        }
    }, [jobID, modelId]);

    // predict automatically once the user stops on a frame
    useEffect(() => {
        if (!active || !autoPredict || frameFetching || frameDeleted) {
            return () => {};
        }

        const cached = cacheRef.current.get(frameNumber);
        if (cached && cached.modelId === modelId) {
            return () => {};
        }

        const timeout = setTimeout(() => predict(frameNumber), AUTO_PREDICT_DELAY_MS);
        return () => clearTimeout(timeout);
    }, [active, autoPredict, frameNumber, frameFetching, frameDeleted, modelId, predict]);

    // explicit "predict" requests from the control or the shortcut
    const latestPredictRequestRef = useRef(predictRequest);
    useEffect(() => {
        if (latestPredictRequestRef.current !== predictRequest) {
            latestPredictRequestRef.current = predictRequest;
            if (active && !frameDeleted) {
                predict(frameNumber);
            }
        }
    }, [predictRequest]);

    const frameResult = active ? cacheRef.current.get(frameNumber) : undefined;
    const visibleSuggestions = useMemo((): Suggestion[] => {
        if (!frameResult || frameResult.modelId !== modelId) {
            return [];
        }

        const dismissed = dismissedRef.current.get(frameNumber) ?? new Set();
        const existingBoxes = states
            .filter((state) => state.shapeType === ShapeType.RECTANGLE && !state.outside)
            .map((state) => state.points as number[]);

        return frameResult.suggestions
            .filter((suggestion) => (
                suggestion.confidence >= threshold &&
                !dismissed.has(suggestion.id) &&
                suggestion.labelID in labelsByID &&
                !existingBoxes.some((box) => iou(box, suggestion.points) > EXISTING_BOX_IOU_THRESHOLD)
            ))
            .sort((a, b) => b.confidence - a.confidence);
    }, [frameResult, cacheVersion, frameNumber, modelId, threshold, states, labelsByID]);

    useEffect(() => {
        if (!(canvasInstance instanceof Canvas)) {
            return;
        }

        canvasInstance.setupSuggestions(visibleSuggestions.map((suggestion) => {
            const label = labelsByID[suggestion.labelID];
            return {
                id: suggestion.id,
                points: suggestion.points,
                color: label.color ?? '#ffffff',
                text: `${label.name} ${Math.round(suggestion.confidence * 100)}%`,
                selected: suggestion.id === selectedID,
            };
        }));
    }, [canvasInstance, visibleSuggestions, selectedID, labelsByID]);

    useEffect(() => () => {
        if (canvasInstance instanceof Canvas) {
            canvasInstance.setupSuggestions([]);
        }
    }, [canvasInstance]);

    const dismiss = useCallback((suggestions: Suggestion[]): void => {
        const dismissed = dismissedRef.current.get(frameNumber) ?? new Set();
        suggestions.forEach((suggestion) => dismissed.add(suggestion.id));
        dismissedRef.current.set(frameNumber, dismissed);
        setSelectedID(null);
        setCacheVersion((version) => version + 1);
    }, [frameNumber]);

    const accept = useCallback((suggestions: Suggestion[]): void => {
        if (!suggestions.length) {
            return;
        }

        const objectStates = suggestions.map((suggestion) => new core.classes.ObjectState({
            frame: frameNumber,
            objectType: ObjectType.SHAPE,
            shapeType: ShapeType.RECTANGLE,
            source: core.enums.Source.AUTO,
            label: labelsByID[suggestion.labelID],
            points: suggestion.points,
            occluded: false,
            zOrder: zLayer,
        }));

        dismiss(suggestions);
        dispatch(createAnnotationsAsync(objectStates));
    }, [frameNumber, labelsByID, zLayer, dismiss]);

    const target = visibleSuggestions.find((suggestion) => suggestion.id === selectedID) ?? null;
    const targetOrFirst = target ?? visibleSuggestions[0] ?? null;

    // the first click on a suggestion selects it, a click on the selected one accepts it
    useEffect(() => {
        if (!(canvasInstance instanceof Canvas)) {
            return () => {};
        }

        const onSuggestionClicked = (event: Event): void => {
            const { id } = (event as CustomEvent<{ id: number }>).detail;
            if (id === selectedID) {
                const suggestion = visibleSuggestions.find((_suggestion) => _suggestion.id === id);
                if (suggestion) accept([suggestion]);
            } else {
                setSelectedID(id);
            }
        };

        canvasInstance.html().addEventListener('canvas.suggestionclicked', onSuggestionClicked);
        return () => {
            canvasInstance.html().removeEventListener('canvas.suggestionclicked', onSuggestionClicked);
        };
    }, [canvasInstance, selectedID, visibleSuggestions, accept]);

    if (!active) {
        return null;
    }

    const canvasIsIdle = (): boolean => (canvasInstance as Canvas).mode() === CanvasMode.IDLE;
    const handlers: Record<keyof typeof componentShortcuts, (event?: KeyboardEvent) => void> = {
        BOX_ASSIST_PREDICT: (event?: KeyboardEvent) => {
            event?.preventDefault();
            requestPrediction();
        },
        BOX_ASSIST_ACCEPT: (event?: KeyboardEvent) => {
            event?.preventDefault();
            if (targetOrFirst && canvasIsIdle()) accept([targetOrFirst]);
        },
        BOX_ASSIST_ACCEPT_ALL: (event?: KeyboardEvent) => {
            event?.preventDefault();
            if (canvasIsIdle()) accept(visibleSuggestions);
        },
        BOX_ASSIST_REJECT: (event?: KeyboardEvent) => {
            event?.preventDefault();
            if (targetOrFirst) dismiss([targetOrFirst]);
        },
    };

    const fetching = fetchingFrames.includes(frameNumber);
    let status: JSX.Element;
    if (fetching) {
        status = (
            <Text className='cvat-box-assist-bar-status'>
                <LoadingOutlined />
                {' Predicting...'}
            </Text>
        );
    } else if (error) {
        status = <Text type='danger' className='cvat-box-assist-bar-status'>{error}</Text>;
    } else if (!frameResult) {
        status = (
            <Text className='cvat-box-assist-bar-status'>
                {`Press ${normalizedKeyMap.BOX_ASSIST_PREDICT} to get suggestions`}
            </Text>
        );
    } else {
        status = (
            <Text className='cvat-box-assist-bar-status'>
                {visibleSuggestions.length ?
                    `${visibleSuggestions.length} suggestion${visibleSuggestions.length > 1 ? 's' : ''}` :
                    'No new suggestions'}
            </Text>
        );
    }

    return (
        <>
            <GlobalHotKeys keyMap={subKeyMap(componentShortcuts, keyMap)} handlers={handlers} />
            <div className='cvat-box-assist-bar'>
                <ThunderboltOutlined className='cvat-box-assist-bar-icon' />
                {status}
                {!fetching && !error && target && (
                    <>
                        <Text className='cvat-box-assist-bar-selected'>
                            {`${labelsByID[target.labelID].name} ${Math.round(target.confidence * 100)}%`}
                        </Text>
                        <Button size='small' type='primary' onClick={() => accept([target])}>
                            {`Accept ${normalizedKeyMap.BOX_ASSIST_ACCEPT}`}
                        </Button>
                        <Button size='small' onClick={() => dismiss([target])}>
                            {`Reject ${normalizedKeyMap.BOX_ASSIST_REJECT}`}
                        </Button>
                    </>
                )}
                {!fetching && !error && !target && visibleSuggestions.length > 0 && (
                    <>
                        <Button size='small' type='primary' onClick={() => accept(visibleSuggestions)}>
                            {`Accept all ${normalizedKeyMap.BOX_ASSIST_ACCEPT_ALL}`}
                        </Button>
                        <Button size='small' onClick={() => dismiss(visibleSuggestions)}>
                            Reject all
                        </Button>
                    </>
                )}
                {!fetching && (error || frameResult) && (
                    <Button size='small' type='text' onClick={() => requestPrediction()}>
                        {error ? 'Retry' : 'Predict again'}
                    </Button>
                )}
                {!fetching && !error && !!frameResult?.unmatchedLabels.length && (
                    <Text type='warning' className='cvat-box-assist-bar-unmatched'>
                        {`No job label for: ${frameResult.unmatchedLabels.join(', ')}`}
                    </Text>
                )}
            </div>
        </>
    );
}

export default React.memo(BoxAssistOverlay);
